import fs from 'node:fs';
import path from 'node:path';
import { microCompact } from './micro-compact.js';
import { buildSemanticGraph, compactSemanticGraph } from './semantic-graph.js';

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

export async function loadWasmEngine(projectDir = process.cwd()) {
  const candidate = path.join(projectDir, 'rust-wasm', 'pkg', 'teneb_wasm_bg.wasm');
  if (!fs.existsSync(candidate)) return null;
  const bytes = await fs.promises.readFile(candidate);
  const mod = await WebAssembly.instantiate(bytes, {});
  return mod.instance.exports;
}

export async function compactWithWasm(text, options = {}, projectDir = process.cwd()) {
  const wasm = await loadWasmEngine(projectDir);
  if (!wasm || typeof wasm.micro_compact !== 'function') return fallbackCompact(text, options);

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const inputBytes = encoder.encode(String(text || ''));
  const ptr = wasm.alloc ? wasm.alloc(inputBytes.length) : 0;
  if (wasm.memory && ptr) {
    new Uint8Array(wasm.memory.buffer, ptr, inputBytes.length).set(inputBytes);
  }

  let result;
  try {
    const outPtr = wasm.micro_compact(ptr, inputBytes.length, options.maxLength ?? 280);
    const outLen = wasm.last_output_len ? wasm.last_output_len() : options.maxLength ?? 280;
    const output = new Uint8Array(wasm.memory.buffer, outPtr, outLen);
    result = decoder.decode(output);
  } finally {
    if (wasm.free && ptr) wasm.free(ptr, inputBytes.length);
  }

  const graph = compactSemanticGraph(buildSemanticGraph(text), { maxNodes: options.maxNodes ?? 18 });
  return {
    engine: 'rust-wasm',
    compacted: result,
    graph,
    stats: {
      before_tokens: String(text || '').length / 4,
      after_tokens: String(result || '').length / 4,
      reduction_ratio: text ? 1 - String(result).length / String(text).length : 0
    }
  };
}
