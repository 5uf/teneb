import fs from 'node:fs';
import path from 'node:path';
import { microCompact } from './micro-compact.js';
import { buildSemanticGraph, compactSemanticGraph } from './semantic-graph.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function fallbackCompact(text, options = {}) {
  const compacted = microCompact(text, options);
  const graph = compactSemanticGraph(buildSemanticGraph(text), { maxNodes: options.maxNodes ?? 18 });
  return {
    engine: 'js-fallback',
    compacted: compacted.compacted,
    alias_map: compacted.alias_map,
    graph,
    stats: compacted.stats
  };
}

// Load the raw WASM binary (no wasm-bindgen, no JS glue needed).
// Built with: cargo build --target wasm32-unknown-unknown --release
// Artifact: rust-wasm/target/wasm32-unknown-unknown/release/teneb_wasm.wasm
export async function loadWasmEngine(projectDir = process.cwd()) {
  const candidate = path.join(
    projectDir, 'rust-wasm', 'target',
    'wasm32-unknown-unknown', 'release', 'teneb_wasm.wasm'
  );
  if (!fs.existsSync(candidate)) return null;
  try {
    const bytes = await fs.promises.readFile(candidate);
    const { instance } = await WebAssembly.instantiate(bytes, {});
    return instance.exports;
  } catch {
    return null;
  }
}

// Call a WASM function that follows the fixed-buffer protocol:
//   input_buf_ptr() → write input bytes there
//   fn(input_len, ...extra_args) → returns output_len
//   output_buf_ptr() → read output_len bytes
function callWasmStr(exports, fnName, text, ...extraArgs) {
  const raw = encoder.encode(String(text || ''));
  const inputBytes = raw.length <= 65536 ? raw : raw.slice(0, 65536);
  const inputPtr = exports.input_buf_ptr();
  new Uint8Array(exports.memory.buffer, inputPtr, inputBytes.length).set(inputBytes);
  exports[fnName](inputBytes.length, ...extraArgs);
  const outLen = exports.output_len();
  const outPtr = exports.output_buf_ptr();
  return decoder.decode(new Uint8Array(exports.memory.buffer, outPtr, outLen));
}

export async function compactWithWasm(text, options = {}, projectDir = process.cwd()) {
  const exports = await loadWasmEngine(projectDir);
  if (!exports || typeof exports.micro_compact !== 'function') {
    return fallbackCompact(text, options);
  }

  const result = callWasmStr(exports, 'micro_compact', text, options.maxLength ?? 280);
  const graph = compactSemanticGraph(buildSemanticGraph(text), { maxNodes: options.maxNodes ?? 18 });
  const textStr = String(text || '');

  return {
    engine: 'rust-wasm',
    compacted: result,
    graph,
    stats: {
      before_tokens: Math.ceil(textStr.length / 4),
      after_tokens: Math.ceil(result.length / 4),
      reduction_ratio: textStr.length ? 1 - result.length / textStr.length : 0
    }
  };
}
