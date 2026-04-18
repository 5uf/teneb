import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { recommendModel, quickHint, fullRecommendation } from '../next-step-advisor.js';

// ── recommendModel ──────────────────────────────────────────────────────────

describe('recommendModel', () => {
  test('returns opus for debugging at green budget', () => {
    assert.equal(recommendModel('debugging', 'green'), 'opus');
  });

  test('returns opus for architecture at green budget', () => {
    assert.equal(recommendModel('architecture', 'green'), 'opus');
  });

  test('returns opus for security-review at green budget', () => {
    assert.equal(recommendModel('security-review', 'green'), 'opus');
  });

  test('returns sonnet for implementation at green budget', () => {
    assert.equal(recommendModel('implementation', 'green'), 'sonnet');
  });

  test('returns sonnet for refactoring at green budget', () => {
    assert.equal(recommendModel('refactoring', 'green'), 'sonnet');
  });

  test('returns sonnet for analysis at green budget', () => {
    assert.equal(recommendModel('analysis', 'green'), 'sonnet');
  });

  test('returns sonnet for general at green budget', () => {
    assert.equal(recommendModel('general', 'green'), 'sonnet');
  });

  test('downgrades opus to sonnet at yellow budget', () => {
    assert.equal(recommendModel('debugging', 'yellow'), 'sonnet');
  });

  test('keeps sonnet at yellow budget (no downgrade below sonnet)', () => {
    assert.equal(recommendModel('implementation', 'yellow'), 'sonnet');
  });

  test('returns haiku for everything at red budget', () => {
    assert.equal(recommendModel('debugging', 'red'), 'haiku');
    assert.equal(recommendModel('implementation', 'red'), 'haiku');
    assert.equal(recommendModel('architecture', 'red'), 'haiku');
    assert.equal(recommendModel('general', 'red'), 'haiku');
  });
});

// ── quickHint ───────────────────────────────────────────────────────────────

describe('quickHint', () => {
  test('edit of non-docs file suggests running tests', () => {
    const hint = quickHint('Edit', '', 'fix bug in parser');
    assert.equal(hint, 'Teneb hint: run tests');
  });

  test('write of non-docs file suggests running tests', () => {
    const hint = quickHint('Write', '', 'write new module');
    assert.equal(hint, 'Teneb hint: run tests');
  });

  test('bash with test failure pattern suggests fix', () => {
    const output = 'FAIL src/tests/foo.test.js\nsome assertion failed';
    assert.equal(quickHint('Bash', output, 'run tests'), 'Teneb hint: fix failing test');
  });

  test('bash with "fail 1" pattern suggests fix', () => {
    const output = 'pass 5\nfail 1';
    assert.equal(quickHint('Bash', output, ''), 'Teneb hint: fix failing test');
  });

  test('bash with cross mark suggests fix', () => {
    const output = '✗ test something\nExpected 1 got 2';
    assert.equal(quickHint('Bash', output, ''), 'Teneb hint: fix failing test');
  });

  test('bash with test pass pattern suggests commit', () => {
    const output = 'pass 12\nfail 0';
    assert.equal(quickHint('Bash', output, ''), 'Teneb hint: commit changes');
  });

  test('bash with checkmark suggests commit', () => {
    const output = '✔ all tests passed';
    assert.equal(quickHint('Bash', output, ''), 'Teneb hint: commit changes');
  });

  test('bash with build error suggests fix build', () => {
    const output = 'error TS2304: Cannot find name';
    assert.equal(quickHint('Bash', output, ''), 'Teneb hint: fix build error');
  });

  test('bash with Build failed suggests fix build', () => {
    const output = 'Build failed with 3 errors';
    assert.equal(quickHint('Bash', output, ''), 'Teneb hint: fix build error');
  });

  test('bash with SyntaxError suggests fix build', () => {
    const output = 'SyntaxError: Unexpected token';
    assert.equal(quickHint('Bash', output, ''), 'Teneb hint: fix build error');
  });

  test('bash with commit pattern suggests push/PR', () => {
    const output = '[main abc1234] fix: resolve parsing issue';
    assert.equal(quickHint('Bash', output, ''), 'Teneb hint: push or open PR');
  });

  test('returns empty string when no strong signal', () => {
    assert.equal(quickHint('Bash', 'some random output', ''), '');
    assert.equal(quickHint('Read', 'file contents', ''), '');
    assert.equal(quickHint('Grep', 'search results', ''), '');
  });
});

// ── fullRecommendation ──────────────────────────────────────────────────────

describe('fullRecommendation', () => {
  test('empty records suggest reviewing project state', () => {
    const rec = fullRecommendation([], 'green');
    assert.equal(rec.prompt, 'Review project state');
    assert.equal(rec.confidence, 0.3);
  });

  test('failures in records suggest fixing', () => {
    const records = [
      { tool: 'Bash', output: 'FAIL test', type: 'test-run' },
      { tool: 'Edit', output: '', type: 'edit' }
    ];
    const rec = fullRecommendation(records, 'green');
    assert.equal(rec.prompt, 'Fix the failing tests or errors');
    assert.equal(rec.confidence, 0.85);
    assert.equal(rec.model, 'opus'); // debugging at green = opus
  });

  test('edits + test pass suggest committing', () => {
    const records = [
      { tool: 'Edit', output: '', type: 'edit' },
      { tool: 'Bash', output: 'pass 5\nfail 0', type: 'test-run' }
    ];
    const rec = fullRecommendation(records, 'green');
    assert.equal(rec.prompt, 'Commit the changes');
    assert.equal(rec.confidence, 0.82);
    assert.equal(rec.model, 'sonnet'); // general at green = sonnet
  });

  test('edits without test run suggest running tests', () => {
    const records = [
      { tool: 'Edit', output: '', type: 'edit' }
    ];
    const rec = fullRecommendation(records, 'green');
    assert.equal(rec.prompt, 'Run tests to verify');
    assert.equal(rec.confidence, 0.78);
    assert.equal(rec.model, 'sonnet'); // implementation at green = sonnet
  });

  test('last task was analysis suggests implementing findings', () => {
    const records = [
      { tool: 'Read', output: '', type: 'analysis' }
    ];
    const rec = fullRecommendation(records, 'green');
    assert.equal(rec.prompt, 'Implement the findings');
    assert.equal(rec.confidence, 0.6);
  });

  test('red budget forces haiku model', () => {
    const records = [
      { tool: 'Bash', output: 'FAIL test', type: 'test-run' }
    ];
    const rec = fullRecommendation(records, 'red');
    assert.equal(rec.model, 'haiku');
  });

  test('yellow budget downgrades opus to sonnet', () => {
    const records = [
      { tool: 'Bash', output: 'FAIL test', type: 'test-run' }
    ];
    const rec = fullRecommendation(records, 'yellow');
    assert.equal(rec.model, 'sonnet'); // debugging at yellow = sonnet (downgraded from opus)
  });

  test('default fallback for unrecognized records', () => {
    const records = [
      { tool: 'Grep', output: 'found something', type: 'search' }
    ];
    const rec = fullRecommendation(records, 'green');
    assert.equal(rec.prompt, 'Review what was done');
    assert.equal(rec.confidence, 0.4);
  });

  test('result always has prompt, model, confidence, reason', () => {
    const rec = fullRecommendation([], 'green');
    assert.ok('prompt' in rec);
    assert.ok('model' in rec);
    assert.ok('confidence' in rec);
    assert.ok('reason' in rec);
  });
});
