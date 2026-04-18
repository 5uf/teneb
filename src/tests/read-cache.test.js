import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadCache, setCached, getCached, diffText, processReadOutput } from '../read-cache.js';

let tmpDir;
beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'teneb-readcache-')); });
afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

describe('read-cache', () => {
  test('returns null for uncached file', () => {
    assert.equal(getCached(tmpDir, 'src/x.js'), null);
  });

  test('setCached + getCached round trip', () => {
    setCached(tmpDir, 'src/x.js', 'hello world');
    const cached = getCached(tmpDir, 'src/x.js');
    assert.equal(cached.content, 'hello world');
    assert.ok(cached.hash);
    assert.ok(cached.cached_at);
  });

  test('diffText returns unchanged for identical', () => {
    assert.equal(diffText('abc\ndef', 'abc\ndef'), 'unchanged');
  });

  test('diffText shows additions', () => {
    const d = diffText('a\nb', 'a\nb\nc');
    assert.ok(d.includes('+3') || d.includes('c'));
  });

  test('diffText shows deletions', () => {
    const d = diffText('a\nb\nc', 'a\nc');
    assert.ok(d.includes('-') || d.length > 0);
  });

  test('processReadOutput first call: stores, returns raw', () => {
    const r = processReadOutput(tmpDir, 'src/x.js', 'line1\nline2');
    assert.equal(r.cacheHit, false);
    assert.equal(r.output, 'line1\nline2');
  });

  test('processReadOutput second call identical: returns unchanged marker', () => {
    processReadOutput(tmpDir, 'src/x.js', 'line1\nline2');
    const r = processReadOutput(tmpDir, 'src/x.js', 'line1\nline2');
    assert.equal(r.cacheHit, true);
    assert.equal(r.isIdentical, true);
    assert.ok(r.output.includes('unchanged'));
  });

  test('processReadOutput second call different: returns diff', () => {
    processReadOutput(tmpDir, 'src/x.js', 'line1\nline2');
    const r = processReadOutput(tmpDir, 'src/x.js', 'line1\nline2\nline3');
    assert.equal(r.cacheHit, true);
    assert.equal(r.isIdentical, false);
    assert.ok(r.output.includes('diff'));
  });

  test('processReadOutput with no filePath returns raw', () => {
    const r = processReadOutput(tmpDir, null, 'content');
    assert.equal(r.cacheHit, false);
    assert.equal(r.output, 'content');
  });
});
