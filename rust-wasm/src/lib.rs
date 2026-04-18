#![no_std]
extern crate alloc;

use alloc::string::String;
use alloc::vec::Vec;
use alloc::collections::BTreeSet;
use alloc::format;
use core::alloc::{GlobalAlloc, Layout};
use core::cell::UnsafeCell;

// ── Bump allocator (512 KB heap, no-free) ────────────────────────────────────

struct BumpAlloc {
    heap: UnsafeCell<[u8; 512 * 1024]>,
    next: UnsafeCell<usize>,
}

unsafe impl Sync for BumpAlloc {}

unsafe impl GlobalAlloc for BumpAlloc {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        let cur = *self.next.get();
        let align = layout.align();
        let aligned = (cur + align - 1) & !(align - 1);
        let end = aligned + layout.size();
        let heap = &mut *self.heap.get();
        if end > heap.len() { return core::ptr::null_mut(); }
        *self.next.get() = end;
        heap.as_mut_ptr().add(aligned)
    }
    unsafe fn dealloc(&self, _ptr: *mut u8, _layout: Layout) {}
}

#[global_allocator]
static ALLOC: BumpAlloc = BumpAlloc {
    heap: UnsafeCell::new([0u8; 512 * 1024]),
    next: UnsafeCell::new(0),
};

#[panic_handler]
fn panic(_: &core::panic::PanicInfo) -> ! { loop {} }

// ── Fixed I/O buffers ─────────────────────────────────────────────────────────

const IO_BUF: usize = 1 << 16; // 64 KB

static mut INPUT_BUF: [u8; IO_BUF] = [0u8; IO_BUF];
static mut OUTPUT_BUF: [u8; IO_BUF] = [0u8; IO_BUF];
static mut OUTPUT_LEN: usize = 0;

#[no_mangle]
pub extern "C" fn input_buf_ptr() -> *mut u8 { unsafe { INPUT_BUF.as_mut_ptr() } }
#[no_mangle]
pub extern "C" fn output_buf_ptr() -> *const u8 { unsafe { OUTPUT_BUF.as_ptr() } }
#[no_mangle]
pub extern "C" fn output_len() -> usize { unsafe { OUTPUT_LEN } }

fn write_output(s: &str) -> usize {
    let b = s.as_bytes();
    let n = b.len().min(IO_BUF);
    unsafe { OUTPUT_BUF[..n].copy_from_slice(&b[..n]); OUTPUT_LEN = n; }
    n
}

fn input_str(len: usize) -> &'static str {
    let l = len.min(IO_BUF);
    unsafe { core::str::from_utf8(&INPUT_BUF[..l]).unwrap_or("") }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn normalize_ws(s: &str) -> String {
    let mut out = String::new();
    let mut space = false;
    for c in s.chars() {
        if c.is_whitespace() { space = true; }
        else { if space && !out.is_empty() { out.push(' '); } out.push(c); space = false; }
    }
    out
}

fn strip_filler(s: &str) -> String {
    let mut out = String::from(s);
    for f in &["really", "very", "actually", "basically", "simply",
                "just", "in order to", "due to the fact that"] {
        out = out.replace(f, "");
    }
    out
}

fn compress_repeated(s: &str) -> String {
    let mut seen: BTreeSet<String> = BTreeSet::new();
    let mut parts: Vec<String> = Vec::new();
    for part in s.split(|c| c == '.' || c == '!' || c == '?') {
        let p = normalize_ws(part.trim());
        if p.is_empty() { continue; }
        let key: String = p.chars().map(|c| c.to_lowercase().next().unwrap_or(c)).collect();
        if seen.insert(key) { parts.push(p); }
    }
    parts.join(". ")
}

fn do_compact(text: &str, max_len: usize) -> String {
    // Clamp input before expensive allocs: strip_filler does 8 replacements,
    // each allocating a new String — processing >4×max_len would exhaust the bump heap.
    let limit = max_len.saturating_mul(4).min(text.len());
    let mut safe = limit;
    while safe > 0 && !text.is_char_boundary(safe) { safe -= 1; }
    let text = &text[..safe];

    let mut s = normalize_ws(text);
    s = strip_filler(&s);
    s = normalize_ws(&s);
    s = compress_repeated(&s);
    if s.len() > max_len {
        let mut head: String = s.chars().take(max_len.saturating_sub(3)).collect();
        if let Some(idx) = head.rfind(' ') { head.truncate(idx); }
        head.push_str(" \u{2026}"); // …
        s = head;
    }
    s
}

fn do_dedupe_lines(text: &str) -> String {
    let mut seen: BTreeSet<String> = BTreeSet::new();
    let mut out: Vec<String> = Vec::new();
    for line in text.split('\n') {
        let l = normalize_ws(line.trim());
        if l.is_empty() { continue; }
        let key: String = l.chars().map(|c| c.to_lowercase().next().unwrap_or(c)).collect();
        if seen.insert(key) { out.push(l); }
    }
    out.join("\n")
}

fn do_signature(text: &str) -> String {
    let len = text.len();
    let words = text.split_whitespace().count();
    let mut uniq: BTreeSet<String> = BTreeSet::new();
    for w in text.split_whitespace() {
        let k: String = w.chars().map(|c| c.to_lowercase().next().unwrap_or(c)).collect();
        uniq.insert(k);
    }
    format!("len:{}|words:{}|uniq:{}", len, words, uniq.len())
}

// ── Exports ───────────────────────────────────────────────────────────────────

#[no_mangle]
pub extern "C" fn micro_compact(input_len: usize, max_len: usize) -> usize {
    let r = do_compact(input_str(input_len), max_len);
    write_output(&r)
}

#[no_mangle]
pub extern "C" fn dedupe_lines(input_len: usize) -> usize {
    let r = do_dedupe_lines(input_str(input_len));
    write_output(&r)
}

#[no_mangle]
pub extern "C" fn semantic_signature(input_len: usize) -> usize {
    let r = do_signature(input_str(input_len));
    write_output(&r)
}

#[no_mangle]
pub extern "C" fn compact_context_graph(input_len: usize, max_len: usize) -> usize {
    let text = input_str(input_len);
    let sig = do_signature(text);
    let compact = do_compact(text, max_len);
    let r = format!("GRAPH:{}::{}", sig, compact);
    write_output(&r)
}
