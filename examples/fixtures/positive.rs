// rust-intel: expected-findings []
// Positive calibration: every u32 bit-pattern is valid and shift policy is explicit.
#[repr(C)]
union Bytes {
    integer: u32,
    bytes: [u8; 4],
}

fn read_integer(value: Bytes) -> u32 {
    // Both union fields initialize all four bytes; every resulting u32 is valid.
    unsafe { value.integer }
}

fn shift(value: u32, count: u32) -> Option<u32> {
    value.checked_shl(count)
}
