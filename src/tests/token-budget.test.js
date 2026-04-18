import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  getPressure,
  resetBudget,
  loadBudget,
  recordTokens,
  recordBlocked,
  maxLengthForTier,
} from '../token-budget.js';

let tmpDir;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'teneb-budget-test-'));
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('getPressure', () => {
  test('0% estimated returns green with ratio 0', () => {
    const result = getPressure(0, 200000);
    assert.equal(result.tier, 'green');
    assert.equal(result.ratio, 0);
  });

  test('15% estimated returns green', () => {
    const result = getPressure(30000, 200000);
    assert.equal(result.tier, 'green');
    assert.ok(Math.abs(result.ratio - 0.15) < 0.001);
  });

  test('50% estimated returns yellow', () => {
    const result = getPressure(100000, 200000);
    assert.equal(result.tier, 'yellow');
    assert.ok(Math.abs(result.ratio - 0.5) < 0.001);
  });

  test('85% estimated returns red', () => {
    const result = getPressure(170000, 200000);
    assert.equal(result.tier, 'red');
    assert.ok(Math.abs(result.ratio - 0.85) < 0.001);
  });

  test('exactly at 40% boundary returns yellow', () => {
    const result = getPressure(80000, 200000);
    assert.equal(result.tier, 'yellow');
    assert.ok(Math.abs(result.ratio - 0.4) < 0.001);
  });

  test('exactly at 80% boundary returns red', () => {
    const result = getPressure(160000, 200000);
    assert.equal(result.tier, 'red');
    assert.ok(Math.abs(result.ratio - 0.8) < 0.001);
  });

  test('custom thresholds are respected', () => {
    const thresholds = { yellow: 0.3, red: 0.6 };
    // 70000/200000 = 0.35, between 0.3 and 0.6 => yellow
    assert.equal(getPressure(70000, 200000, thresholds).tier, 'yellow');
    // 130000/200000 = 0.65, above 0.6 => red
    assert.equal(getPressure(130000, 200000, thresholds).tier, 'red');
    // 20000/200000 = 0.10, below 0.3 => green
    assert.equal(getPressure(20000, 200000, thresholds).tier, 'green');
  });

  test('max of 0 returns green with ratio 0 (no division by zero)', () => {
    const result = getPressure(100, 0);
    assert.equal(result.tier, 'green');
    assert.equal(result.ratio, 0);
  });
});

describe('resetBudget', () => {
  test('creates file with correct structure', () => {
    const projectDir = path.join(tmpDir, 'proj-reset');
    fs.mkdirSync(projectDir, { recursive: true });

    const result = resetBudget(projectDir, 'sess-001', 150000);
    assert.equal(result.session_id, 'sess-001');
    assert.equal(result.estimated_tokens, 0);
    assert.equal(result.tool_calls, 0);
    assert.equal(result.prompts_blocked, 0);
    assert.equal(result.max_budget, 150000);
    assert.ok(typeof result.started_at === 'string');

    // Verify file on disk
    const filePath = path.join(projectDir, '.teneb', 'session-budget.json');
    assert.ok(fs.existsSync(filePath));
    const onDisk = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.deepStrictEqual(onDisk, result);
  });

  test('uses default maxBudget of 200000', () => {
    const projectDir = path.join(tmpDir, 'proj-default');
    fs.mkdirSync(projectDir, { recursive: true });

    const result = resetBudget(projectDir, 'sess-002');
    assert.equal(result.max_budget, 200000);
  });

  test('overwrites existing budget file', () => {
    const projectDir = path.join(tmpDir, 'proj-overwrite');
    fs.mkdirSync(projectDir, { recursive: true });

    resetBudget(projectDir, 'sess-old');
    const result = resetBudget(projectDir, 'sess-new');
    assert.equal(result.session_id, 'sess-new');
    assert.equal(result.estimated_tokens, 0);
  });
});

describe('loadBudget', () => {
  test('with missing file returns green defaults', () => {
    const projectDir = path.join(tmpDir, 'proj-missing');
    fs.mkdirSync(projectDir, { recursive: true });

    const result = loadBudget(projectDir);
    assert.equal(result.estimated_tokens, 0);
    assert.equal(result.tool_calls, 0);
    assert.equal(result.prompts_blocked, 0);
    assert.equal(result.max_budget, 200000);
    assert.equal(result.pressure.tier, 'green');
    assert.equal(result.pressure.ratio, 0);
  });

  test('with corrupt file returns green defaults', () => {
    const projectDir = path.join(tmpDir, 'proj-corrupt');
    const tenebDir = path.join(projectDir, '.teneb');
    fs.mkdirSync(tenebDir, { recursive: true });
    fs.writeFileSync(path.join(tenebDir, 'session-budget.json'), 'not-json!!!');

    const result = loadBudget(projectDir);
    assert.equal(result.pressure.tier, 'green');
    assert.equal(result.estimated_tokens, 0);
  });

  test('after resetBudget returns correct data with pressure', () => {
    const projectDir = path.join(tmpDir, 'proj-load');
    fs.mkdirSync(projectDir, { recursive: true });

    resetBudget(projectDir, 'sess-load', 100000);
    const result = loadBudget(projectDir);
    assert.equal(result.session_id, 'sess-load');
    assert.equal(result.max_budget, 100000);
    assert.equal(result.pressure.tier, 'green');
  });

  test('after recordTokens shows updated values', () => {
    const projectDir = path.join(tmpDir, 'proj-load-after-record');
    fs.mkdirSync(projectDir, { recursive: true });

    resetBudget(projectDir, 'sess-lr', 100000);
    recordTokens(projectDir, 50000);
    const result = loadBudget(projectDir);
    assert.equal(result.estimated_tokens, 50000);
    assert.equal(result.tool_calls, 1);
    assert.equal(result.pressure.tier, 'yellow');
  });

  test('custom thresholds passed through to getPressure', () => {
    const projectDir = path.join(tmpDir, 'proj-load-thresh');
    fs.mkdirSync(projectDir, { recursive: true });

    resetBudget(projectDir, 'sess-thresh', 100000);
    recordTokens(projectDir, 35000);
    const result = loadBudget(projectDir, { yellow: 0.3, red: 0.6 });
    assert.equal(result.pressure.tier, 'yellow');
  });
});

describe('recordTokens', () => {
  test('increments estimated_tokens and tool_calls', () => {
    const projectDir = path.join(tmpDir, 'proj-record');
    fs.mkdirSync(projectDir, { recursive: true });

    resetBudget(projectDir, 'sess-rec', 200000);
    recordTokens(projectDir, 5000);
    const b1 = loadBudget(projectDir);
    assert.equal(b1.estimated_tokens, 5000);
    assert.equal(b1.tool_calls, 1);
  });

  test('increments correctly across multiple calls', () => {
    const projectDir = path.join(tmpDir, 'proj-multi');
    fs.mkdirSync(projectDir, { recursive: true });

    resetBudget(projectDir, 'sess-multi', 200000);
    recordTokens(projectDir, 1000);
    recordTokens(projectDir, 2000);
    recordTokens(projectDir, 3000);

    const result = loadBudget(projectDir);
    assert.equal(result.estimated_tokens, 6000);
    assert.equal(result.tool_calls, 3);
  });
});

describe('recordBlocked', () => {
  test('increments prompts_blocked', () => {
    const projectDir = path.join(tmpDir, 'proj-blocked');
    fs.mkdirSync(projectDir, { recursive: true });

    resetBudget(projectDir, 'sess-blocked', 200000);
    recordBlocked(projectDir);
    recordBlocked(projectDir);

    const result = loadBudget(projectDir);
    assert.equal(result.prompts_blocked, 2);
  });
});

describe('maxLengthForTier', () => {
  test('green returns 220', () => {
    assert.equal(maxLengthForTier('green'), 220);
  });

  test('yellow returns 140', () => {
    assert.equal(maxLengthForTier('yellow'), 140);
  });

  test('red returns 80', () => {
    assert.equal(maxLengthForTier('red'), 80);
  });

  test('unknown tier returns 80 (conservative fallback)', () => {
    assert.equal(maxLengthForTier('unknown'), 80);
  });
});
