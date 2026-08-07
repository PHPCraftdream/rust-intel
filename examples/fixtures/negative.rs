// rust-intel: expected-findings [B5, B26]
// Negative calibration: these patterns should be reported, not silently ignored.
#[repr(C)]
union Bytes {
    integer: u32,
    flag: bool,
}

fn invalid_read(value: Bytes) -> bool {
    unsafe { value.flag }
}

fn unchecked_shift(value: u32, count: u32) -> u32 {
    value << count
}
