import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadWasmEngine } from '../wasm-bridge.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function callWasm(exports, fnName, text, ...extraArgs) {
  const raw = encoder.encode(String(text));
  const inputBytes = raw.length <= 65536 ? raw : raw.slice(0, 65536);
  const ptr = exports.input_buf_ptr();
  new Uint8Array(exports.memory.buffer, ptr, inputBytes.length).set(inputBytes);
  exports[fnName](inputBytes.length, ...extraArgs);
  const outLen = exports.output_len();
  const outPtr = exports.output_buf_ptr();
  return decoder.decode(new Uint8Array(exports.memory.buffer, outPtr, outLen));
}

test('WASM: 80KB input is clamped and compacted without crash', async () => {
  const exports = await loadWasmEngine(process.cwd());
  if (!exports) {
    // WASM binary not compiled — skip gracefully
    return;
  }

  const big = 'The quick brown fox jumps over the lazy dog. '.repeat(2000); // ~90 KB
  const result = callWasm(exports, 'micro_compact', big, 280);

  assert.ok(typeof result === 'string', 'output is a string');
  assert.ok(result.length > 0, 'output is non-empty');
  assert.ok(result.length <= 285, `output within maxLen+5, got ${result.length}`);
});

test('WASM: normal input compacts correctly', async () => {
  const exports = await loadWasmEngine(process.cwd());
  if (!exports) return;

  const text = 'This is really very basically just a simple test. This is really very basically just a simple test.';
  const result = callWasm(exports, 'micro_compact', text, 80);

  assert.ok(result.length < text.length, 'compacted is shorter');
  assert.ok(result.length <= 85, `within maxLen+5, got ${result.length}`);
});
