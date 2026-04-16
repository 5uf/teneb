use wasm_bindgen::prelude::*;

fn normalize_whitespace(input: &str) -> String {
    input.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn strip_filler(input: &str) -> String {
    let mut s = input.to_string();
    for phrase in [
        "really", "very", "actually", "basically", "simply", "just", "in order to", "due to the fact that"
    ] {
        s = s.replace(phrase, "");
    }
    s
}

fn compress_repeated_sentences(input: &str) -> String {
    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::new();
    for part in input.split(|c| c == '.' || c == '!' || c == '?') {
        let p = normalize_whitespace(part.trim());
        if p.is_empty() { continue; }
        let key = p.to_lowercase();
        if seen.insert(key) {
            out.push(p);
        }
    }
    if out.is_empty() { return String::new(); }
    out.join(". ")
}

#[wasm_bindgen]
pub fn micro_compact(input: &str, max_len: usize) -> String {
    let mut s = normalize_whitespace(input);
    s = strip_filler(&s);
    s = compress_repeated_sentences(&s);

    if s.len() > max_len {
        let mut head = s.chars().take(max_len.saturating_sub(20)).collect::<String>();
        if let Some(idx) = head.rfind(' ') {
            head.truncate(idx);
        }
        head.push_str(" …");
        s = head;
    }
    s
}

#[wasm_bindgen]
pub fn dedupe_lines(input: &str) -> String {
    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::new();
    for line in input.lines() {
        let l = normalize_whitespace(line.trim());
        if l.is_empty() { continue; }
        let key = l.to_lowercase();
        if seen.insert(key) {
            out.push(l);
        }
    }
    out.join("\n")
}

#[wasm_bindgen]
pub fn semantic_signature(input: &str) -> String {
    let len = input.len();
    let words = input.split_whitespace().count();
    let uniq = input.split_whitespace().map(|w| w.to_lowercase()).collect::<std::collections::HashSet<_>>().len();
    format!("len:{}|words:{}|uniq:{}", len, words, uniq)
}

#[wasm_bindgen]
pub fn compact_context_graph(input: &str) -> String {
    let compact = micro_compact(input, 220);
    format!("GRAPH:{}::{}", semantic_signature(input), compact)
}
