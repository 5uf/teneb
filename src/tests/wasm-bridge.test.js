import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { compactWithWasm, loadWasmEngine } from '../wasm-bridge.js';

describe('loadWasmEngine', () => {
  test('returns null when pkg dir does not exist', async () => {
    const result = await loadWasmEngine(os.tmpdir());
    assert.equal(result, null);
  });
});

describe('compactWithWasm (fallback path)', () => {
  test('returns js-fallback engine when WASM not compiled', async () => {
    // Use a temp dir with no WASM pkg — forces fallback
    const result = await compactWithWasm('hello world. hello world.', { maxLength: 200 }, os.tmpdir());
    assert.equal(result.engine, 'js-fallback');
    assert.ok(typeof result.compacted === 'string');
    assert.ok(result.compacted.length > 0);
    assert.ok(typeof result.stats === 'object');
    assert.ok(typeof result.stats.before_tokens === 'number');
    assert.ok(typeof result.stats.after_tokens === 'number');
    assert.ok(typeof result.stats.reduction_ratio === 'number');
  });

  test('fallback compacted is shorter or equal to original for verbose input', async () => {
    const verbose = 'really very actually basically just do the thing. really very actually basically just do the thing.';
    const result = await compactWithWasm(verbose, { maxLength: 200 }, os.tmpdir());
    // compacted should be <= original (dedup + filler removal)
    assert.ok(result.compacted.length <= verbose.length,
      `compacted=${result.compacted.length} should be <= original=${verbose.length}`);
  });

  test('fallback returns graph with nodes', async () => {
    const result = await compactWithWasm('semantic-graph compaction reduces token cost.', {}, os.tmpdir());
    assert.ok(Array.isArray(result.graph?.nodes));
  });

  test('handles empty string without throwing', async () => {
    const result = await compactWithWasm('', {}, os.tmpdir());
    assert.ok(typeof result.compacted === 'string');
  });
});
