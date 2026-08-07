# Gap audit — FFI/ABI boundary and unsafe-Rust edge cases

> **Status:** Historical input to v0.4.7. The current rules and second-pass corrections are tracked in [`README.md`](README.md) and the canonical modules; this file is not normative.

Scope: `skill/unsafe-and-ffi.md` (§B5, §B7, §B18, §B18a, §B25), cross-checked against §B9/§B13 in `skill/concurrency-and-state.md` and the SKILL.md trigger tables. Question asked: which real, documented, LLM-plausible unsafe/FFI footguns compile, pass tests with a well-behaved C stub, and break in production — and are **not** already a bullet in this module. Every candidate below was checked against the actual bullet text of the existing categories, not just their headings.

---

## Gap 1 — The C library itself is not thread-safe (global mutable state behind the FFI boundary)

**The shape.** An LLM wraps a C library in a Rust type, satisfies the compiler (raw handle behind `Arc<Mutex<_>>` or a fresh handle per thread), and calls it from multiple tokio tasks / threads. But the *library* has internal global mutable state — `errno`-style globals, `getenv`/`setenv`, a global config struct, a non-reentrant parser, one-time init functions (`curl_global_init`, `Xinit`, OpenSSL <1.1 locking callbacks). No amount of synchronization *of the Rust wrapper's own data* helps: two distinct handles still race on the library's global. The Rust-side `Mutex` an LLM adds guards the wrong object.

**Why in-scope.** Compiles cleanly; single-threaded tests and even light multi-threaded tests pass (glibc caches make the race hard to hit); production segfaults under real concurrency. This is precisely CVE-2020-26235: `time`/`chrono` called `localtime_r`, which reads `TZ` via `getenv`, racing `setenv` from another thread — multithreaded programs segfault by dereferencing a dangling pointer. Shipped for years in two of the most-downloaded crates in the ecosystem.

**Why not already covered.** §B18's bullets are about `unsafe impl Send/Sync` on *your own type's fields* ("a type contains a `*const T` … proving that aliasing is controlled by external synchronization") — the invariant cited is about access to the wrapper's data, and its REQUIRED fix ("wrap the handle in an `Arc<Mutex<RawHandle>>`") is exactly the fix that does NOT close this gap, because two independently-locked handles still race on the library's global. §B25's BANNED/REQUIRED lists cover panic, ABI types, allocator mismatch, `cap` mismatch, paired free functions, layout verification — nothing asks "is this C library thread-safe / reentrant at all, and what does its documentation say about init and globals?". §B13's TOCTOU body is about Rust concurrent collections. The question "audit the C library's own thread-safety contract before deciding what `Send`/`Sync` and what *process-global* lock the wrapper needs" appears nowhere. The `errno` sub-case (reading `std::io::Error::last_os_error()` after intervening calls that clobber `errno`) is likewise uncovered.

**Minimal example (compiles, tests green, UB under load):**

```rust
struct Parser(*mut c_lib::parser); // c_lib docs: "not thread-safe; uses a global scratch buffer"
unsafe impl Send for Parser {}     // SAFETY: each thread owns its own parser handle — TRUE, and insufficient
impl Parser {
    fn parse(&mut self, s: &CStr) -> i32 { unsafe { c_lib::parse(self.0, s.as_ptr()) } }
}
// Two threads, two handles, zero shared Rust data — still a data race on the C global.
```

**Sources.** [RUSTSEC-2020-0071](https://rustsec.org/advisories/RUSTSEC-2020-0071) (time, CVE-2020-26235), [RUSTSEC-2020-0159](https://rustsec.org/advisories/RUSTSEC-2020-0159.html) (chrono), [chrono#499](https://github.com/chronotope/chrono/issues/499), [time#293](https://github.com/time-rs/time/issues/293); the Rustonomicon FFI chapter warns "C libraries often expose interfaces that aren't thread-safe" ([nomicon/ffi](https://doc.rust-lang.org/nomicon/ffi.html)).

**Severity / placement.** 🔴 (data race → segfault/UB, invisible to tests — same class as §B18). Suggested: new REQUIRED+BANNED bullets in §B25 (or a lettered §B25a "the library's own concurrency contract"), cross-referenced from §B18: *before* writing `unsafe impl Send/Sync` for an FFI handle, cite the library's documented thread-safety level (per-handle? global-lock-required? init-once?); a non-thread-safe library gets one process-global lock (or a dedicated thread), not per-handle locks. Plus a small `errno` bullet: capture `last_os_error()` immediately, before any other call.

---

## Gap 2 — Callback/context UAF: C calls back after the Rust context is gone

**The shape.** The classic user-data trampoline: box a closure/context, `Box::into_raw` it, register `(extern "C" fn trampoline, *mut c_void)` with the C library. The LLM gets the trampoline right (it's in the Nomicon) and frees the context in the wrapper's `Drop` — but the C library can still fire the callback *after* that point: the callback wasn't unregistered before the free, the library delivers asynchronously on its own thread, or deregistration itself is asynchronous ("stops delivering *eventually*"). Result: the trampoline dereferences a dangling `*mut c_void`. A second sub-shape from the field: casting user_data back to `Box<F>` (taking ownership) inside the trampoline instead of `&mut F` — the closure is dropped on the first invocation, and every later invocation is UAF + double-free.

**Why in-scope.** Compiles; a well-behaved synchronous C stub in tests registers, fires once, deregisters — green. Production library with async delivery → UAF, typically as rare heap corruption.

**Why not already covered.** §B25 covers the *panic* direction of callbacks ("extern "C" fn body that can panic") and ownership of *buffers/values* crossing the boundary (`Box::from_raw` allocator matching, paired `rust_drop_T`, `Vec` triples). Nothing in §B25 addresses callback **registration lifetime** — the temporal contract that the context must outlive the registration and that unregistration must be *confirmed complete* before the context is freed. §B18a covers variance of pointer wrappers, §B1 covers lifetimes in safe signatures; neither expresses "the C side holds an untracked copy of your pointer". This is a distinct UAF shape with its own discipline (unregister-then-free ordering, `Box::leak` vs `Box::into_raw`/`from_raw` pairing, borrow-not-own inside the trampoline).

**Minimal example:**

```rust
pub struct Watcher { ctx: *mut Ctx, handle: *mut c_lib::watch }
impl Watcher {
    pub fn new(f: impl FnMut(u32) + 'static) -> Self {
        let ctx = Box::into_raw(Box::new(Ctx { f: Box::new(f) }));
        let handle = unsafe { c_lib::watch_start(trampoline, ctx.cast()) };
        Watcher { ctx, handle }
    }
}
impl Drop for Watcher {
    fn drop(&mut self) {
        unsafe {
            drop(Box::from_raw(self.ctx));      // freed FIRST…
            c_lib::watch_stop(self.handle);     // …library may fire the callback in between,
        }                                       // or keep firing until stop *completes* on its thread
    }
}
```

**Sources.** Rustonomicon, "Targeting callbacks to Rust objects": the C library holds a raw pointer to the Rust object, and the programmer must guarantee the object outlives every possible invocation ([nomicon/ffi.html](https://doc.rust-lang.org/nomicon/ffi.html)); documented field case of the `Box`-in-trampoline double-drop in the tcod-rs callback write-up ([aimlesslygoingforward.com](https://aimlesslygoingforward.com/blog/2014/09/18/safe-rust-callback-bindings/)); Rust Reference, dangling-pointer access is UB ([behavior-considered-undefined](https://doc.rust-lang.org/reference/behavior-considered-undefined.html)).

**Severity / placement.** 🔴. Suggested: new BANNED+REQUIRED bullets in §B25 — BANNED: freeing/dropping callback context before unregistration is confirmed complete; reclaiming user_data as an owning `Box` in a reinvocable trampoline. REQUIRED: unregister → (synchronize with in-flight callbacks per the library's docs) → free, in that order; trampoline borrows (`&mut *(p as *mut Ctx)`), ownership is reclaimed exactly once at teardown; state whether the library may invoke from another thread (feeds Gap 1 and §B18).

---

## Gap 3 — Exported `#[no_mangle] extern "C"` entry points that trust the type system across the boundary

**The shape.** The LLM exports Rust to C: `#[no_mangle] pub extern "C" fn process(s: &Header, name: &str) -> u32 { ... }` — a *safe* fn with reference/`&str`/`bool`/enum parameters, with no validation, because "the type system guarantees `&Header` is valid". But the caller is C: it can pass NULL, a misaligned pointer, a non-UTF-8 `&str`, a `bool` of 3, an out-of-range enum discriminant. Producing an invalid value at any of these types is immediate UB *inside safe Rust* — the entry point laundered untrusted bits into a type whose invariants were never checked. The declaration compiles without warning, and Rust-side tests (which call it with valid values) pass.

**Why in-scope.** Compiles; `cargo test` calling the exported fn from Rust is green; the real C caller passing NULL/garbage is UB, not a catchable error. Rust 2024 making the attribute `unsafe(no_mangle)` acknowledges the export is a soundness liability, but it does not force parameter validation.

**Why not already covered.** §B5 has the adjacent bullet "Marking a public function `pub fn` when its contract actually requires invariants from the caller → `pub unsafe fn`" — but `unsafe fn` is invisible to a C caller; the marker fixes the *Rust*-side contract, not the boundary. §B25's REQUIRED "every `extern "C"` function takes/returns `#[repr(C)]` types only" (in §B5's FFI bullet) covers ABI *layout*, and §B25's export coverage is about panics and `#[no_mangle]` **symbol collisions** — not about the arguments being attacker-controlled bits. The §B5 "validate bytes → `Result` before minting" rule is the same philosophy but its bullets are all about `transmute`/`from_raw_parts` on buffers, not about the *signature* of an exported entry point. The specific discipline — exported fns take only raw pointers and primitive ints; null/align/len/UTF-8/discriminant checks happen inside before any typed value exists — is absent.

**Minimal example:**

```rust
#[no_mangle]
pub extern "C" fn header_len(h: &Header) -> u32 { h.len }   // C passes NULL → a null & exists → UB
#[no_mangle]
pub extern "C" fn set_mode(m: Mode) -> bool { ... }         // C passes 7; Mode has 3 variants → UB at the call
```

**Sources.** Rust Reference, "Behavior considered undefined": producing an invalid value — a null `&`/`&mut`, a `bool` other than 0/1, an enum with an invalid discriminant, non-UTF-8 `str` — is UB even if the value is never used ([reference/behavior-considered-undefined](https://doc.rust-lang.org/reference/behavior-considered-undefined.html)); Rustonomicon FFI chapter: "almost any function taking a pointer argument isn't valid for all inputs" ([nomicon/ffi](https://doc.rust-lang.org/nomicon/ffi.html)); Rust 2024 `unsafe(no_mangle)` (unsafe attributes, edition guide).

**Severity / placement.** 🔴. Suggested: new bullets in §B25 — BANNED: exported (`#[no_mangle]`/`#[unsafe(no_mangle)]` + `extern "C"`) fns taking `&T`, `&str`, `bool`, non-`#[repr(int)]`-validated enums, or any type with invariants directly from the foreign caller. REQUIRED: exported signatures take `*const/*mut` + lengths and primitive ints only; the body checks null/alignment/range/UTF-8 and returns an error code before minting any typed value — the read-direction mirror of §B5's validate-before-mint, applied to the export surface. Also a trigger-table row: "export a Rust function to C", "cdylib", "call this from Python/Node via FFI".

---

## Gap 4 — `union` field reads: no active-field tracking, wrong-field read is instant UB

**The shape.** FFI headers full of C unions (`sockaddr`-style, event structs, VARIANT-style tagged messages) get bindgen'd or hand-ported to Rust `union`. The LLM reads a field based on what it *expects* the C side wrote — `unsafe { ev.data.ptr }` — with no check of the tag, or reads a field of a union the C side never initialized. Rust unions have no active-field notion and no runtime tag: every read just reinterprets the bits at the field's type, and it is the programmer's responsibility that the bits are valid at that type — reading 3 as `bool`, a garbage discriminant, or uninitialized bytes is UB. A second shape: on a non-`#[repr(C)]` union field offsets are unspecified, so write-one-field-read-another is not even a defined transmute.

**Why in-scope.** Compiles (the `unsafe` block is one keyword away); tests with a stub that always writes the expected variant pass; production input with a different tag → UB. LLMs also reinvent "union + bool flag" where Rust `enum` was the answer.

**Why not already covered.** Grep for `union` across `skill/`: zero hits in any category body. §B5 covers `transmute`, `mem::zeroed`, `from_raw_parts`, padding-serialize — the same *family*, but none of its bullets mention union field access, tag discipline, or `#[repr(C)]` on FFI unions; §B20 (serde untagged) is the safe-Rust cousin but lives in a different world. This is a genuine hole in the module's coverage of core unsafe surface area.

**Minimal example:**

```rust
#[repr(C)] union EvData { fd: i32, ptr: *mut c_void }
#[repr(C)] struct Event { tag: u32, data: EvData }
fn handle(ev: &Event) -> *mut c_void {
    unsafe { ev.data.ptr }   // tag never checked; if C wrote `fd`, the upper bytes are stale/uninit → UB on use
}
```

**Sources.** Rust Reference, Unions: "reading a union field reads the bits of the union at the field's type… it is the programmer's responsibility to make sure that the data is valid at the field's type; failing to do so results in undefined behavior" ([reference/items/unions](https://doc.rust-lang.org/reference/items/unions.html)).

**Severity / placement.** 🔴 (it is §B5-class UB). Suggested: new BANNED+REQUIRED bullets in §B5 — BANNED: reading a union field without checking the discriminant/tag that determines which field the writer used; a non-`#[repr(C)]` union used for FFI or bit-reinterpretation. REQUIRED: every union read sits behind a safe accessor that checks the tag first and has a `// SAFETY:` naming which write made these bits valid at this field's type; if the union exists only to pair with a Rust-side flag, use `enum`. Plus a code-pattern trigger row in SKILL.md (`union` keyword / `bindgen` output with unions → §B5).

---

## Gap 5 — Per-function ownership audit of the C API (take vs borrow is not uniform across a library)

**The shape.** §B25 nails the allocator-mismatch mechanics (never `free()` a Rust `Box`, never `Box::from_raw` a `malloc` pointer, `cap` must round-trip). But the production double-free/leak usually enters one level up: the LLM assumes one ownership convention for the whole C library, when real libraries are inconsistent — `lib_set_name(obj, s)` copies, `lib_set_payload(obj, p)` takes ownership, `lib_get_name()` returns a borrowed internal pointer while `lib_get_error()` returns a `malloc`'d string the caller must free; and conventions change between library versions. The LLM writes one uniform wrapper pattern (e.g. always `CString::into_raw`, or always freeing returned `*const c_char`), which is right for some functions and a double-free or leak for the others.

**Why in-scope.** Compiles; a symmetric test stub (or the subset of functions the tests touch) passes; production hits the other convention → heap corruption or an unbounded leak.

**Why not already covered.** §B25's ownership bullets are all about pointers whose provenance is *Rust* (`Box::into_raw` → paired `rust_drop_T`; `Vec` triple round-trip) or about mixing allocators mechanically. There is no bullet imposing the *audit discipline*: for every C function wrapped, record from the C documentation who allocates, who frees, and whether the return is borrowed-from-internal or caller-owned — and encode that per-function, not per-library. The Blocking-protocol lens (§B5: block when caller invariants are unstated) doesn't reach here because the invariants are stated — in the C docs the LLM didn't read.

**Minimal example:**

```rust
// C docs: lib_take(p) TAKES ownership; lib_use(p) BORROWS. LLM wraps both identically:
fn take(v: Vec<u8>) { let p = v.as_ptr(); unsafe { c_lib::lib_take(p.cast_mut()) } } // C frees; Rust frees too → double free
fn use_(v: &Vec<u8>) { unsafe { c_lib::lib_use(v.as_ptr()) } }                        // fine — pattern matched by luck
```

**Sources.** Rustonomicon FFI chapter (ownership of foreign strings/objects; `strdup`-style returns vs borrowed pointers — [nomicon/ffi](https://doc.rust-lang.org/nomicon/ffi.html)); the discipline is spelled out in the widely-cited "Wrapping Unsafe C Libraries in Rust" write-up ([medium.com/dwelo-r-d](https://medium.com/dwelo-r-d/wrapping-unsafe-c-libraries-in-rust-d75aeb283c65)).

**Severity / placement.** 🔴 within §B25 (double-free = heap corruption). Suggested: one REQUIRED bullet in §B25 — for each wrapped C function, the `// SAFETY:` block states the ownership direction (copies / takes / returns-borrowed / returns-caller-owned) *with a citation to the C doc line*, and mismatched conventions within one library are called out explicitly; treat an undocumented ownership direction as a §B5-style block-and-ask.

---

## Verdict

Seven candidates went in; five survived. The two that died on inspection: (a) the FFI-specific `catch_unwind`/`AssertUnwindSafe` "C state left inconsistent mid-call" angle — §B25's REQUIRED text already says "if you reach for `AssertUnwindSafe`, confirm no caller observes broken invariants after the catch", which covers the essence even if a C-state example would sharpen it (an enrichment, not a gap); and (b) the classic `CString::new(..).unwrap().as_ptr()` dangling-temporary — real and LLM-typical, but rustc's `dangling_pointers_from_temporaries` lint (warn-by-default since 1.84, on this spec's MSRV 1.85 floor) fires on it, putting it out of scope by the spec's own "the toolchain already catches it" rule. Of the five survivors, Gaps 1, 2, 3 and 4 are clean holes — nothing in the existing bullet text approaches them (union coverage is literally absent; C-library-global thread-safety is actively *masked* by §B18's per-handle-lock fix); Gap 5 is the weakest, an audit-discipline generalization of ownership mechanics §B25 already covers per-pointer, and I would rank it last if the maintainer wants to take fewer than five.
