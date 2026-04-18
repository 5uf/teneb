import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LearningStore } from '../learning-store.js';

let tmpDir;
let storePath;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'teneb-test-'));
  storePath = path.join(tmpDir, 'learning.jsonl');
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('LearningStore', () => {
  test('creates file on construction', () => {
    const store = new LearningStore(storePath);
    assert.ok(fs.existsSync(storePath));
  });

  test('append writes valid JSON lines', () => {
    const store = new LearningStore(storePath);
    store.append({ tool_name: 'Read', success: true, tokens_saved: 10 });
    const lines = fs.readFileSync(storePath, 'utf8').trim().split('\n').filter(Boolean);
    assert.ok(lines.length >= 1);
    const rec = JSON.parse(lines[lines.length - 1]);
    assert.equal(rec.tool_name, 'Read');
    assert.ok(typeof rec.id === 'string');
    assert.ok(typeof rec.created_at === 'string');
  });

  test('readAll returns all records', () => {
    const store = new LearningStore(storePath);
    store.append({ type: 'run', tool_name: 'Edit', success: false });
    const all = store.readAll();
    assert.ok(all.length >= 2);
    assert.ok(all.every((r) => typeof r === 'object'));
  });

  test('getToolStats computes reliability', () => {
    const file = path.join(tmpDir, 'stats.jsonl');
    const store = new LearningStore(file);
    store.append({ tool_name: 'Bash', success: true, tokens_saved: 5 });
    store.append({ tool_name: 'Bash', success: true, tokens_saved: 15 });
    store.append({ tool_name: 'Bash', success: false, tokens_saved: 0 });

    const stats = store.getToolStats();
    const bash = stats.find((s) => s.tool === 'Bash');
    assert.ok(bash, 'Bash stats not found');
    assert.equal(bash.attempts, 3);
    assert.equal(bash.success, 2);
    assert.ok(Math.abs(bash.reliability - 2 / 3) < 0.01);
    assert.ok(Math.abs(bash.avg_tokens_saved - (5 + 15 + 0) / 3) < 0.01);
  });

  test('getFingerprint returns summary for task type', () => {
    const file = path.join(tmpDir, 'fp.jsonl');
    const store = new LearningStore(file);
    store.append({ task_type: 'debugging', success: true, tokens_saved: 8, tool_names: ['Read'] });
    store.append({ task_type: 'debugging', success: false, tokens_saved: 0, failure_mode: 'timeout' });

    const fp = store.getFingerprint('debugging', ['Read']);
    assert.equal(fp.task_type, 'debugging');
    assert.ok(fp.attempts >= 1);
    assert.ok(fp.success_rate >= 0 && fp.success_rate <= 1);
  });

  test('recordTechnique / recordMistake convenience wrappers', () => {
    const file = path.join(tmpDir, 'tm.jsonl');
    const store = new LearningStore(file);
    store.recordTechnique({ name: 'alias-compaction', score: 0.9 });
    store.recordMistake({ description: 'over-verbose output', tool_name: 'Bash' });

    const all = store.readAll();
    assert.ok(all.some((r) => r.type === 'technique' && r.name === 'alias-compaction'));
    assert.ok(all.some((r) => r.type === 'mistake'));
  });

  test('records have unique ids', () => {
    const file = path.join(tmpDir, 'unique.jsonl');
    const store = new LearningStore(file);
    const r1 = store.append({ x: 1 });
    const r2 = store.append({ x: 2 });
    assert.notEqual(r1.id, r2.id);
  });
});
