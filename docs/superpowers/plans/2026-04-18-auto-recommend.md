# Auto-Recommend Next Steps + Model Selection — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After each tool call and at session end, Teneb suggests the likely next action and recommended model based on context analysis of what just happened.

**Architecture:** A new `src/next-step-advisor.js` module provides two functions: `quickHint` (1-line per-tool hint) and `fullRecommendation` (end-of-session recommendation). Both use rule-based analysis of tool names, output patterns, and session records. Model selection uses task-type heuristics adjusted by budget pressure. PostToolUse hook calls `quickHint`; Stop hook calls `fullRecommendation`.

**Tech Stack:** Node.js 20, `node:test`, no external dependencies.

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/next-step-advisor.js` (new) | quickHint, fullRecommendation, recommendModel — pure functions |
| `src/tests/next-step-advisor.test.js` (new) | Unit tests for all rules and model selection |
| `.claude/hooks/post-tool-use.js` (modify) | Append quickHint to additionalContext |
| `.claude/hooks/stop.js` (modify) | Add fullRecommendation output |

---

### Task 1: Next-Step Advisor Module

**Files:**
- Create: `src/next-step-advisor.js`
- Create: `src/tests/next-step-advisor.test.js`

- [ ] **Step 1: Write failing tests**

```js
// src/tests/next-step-advisor.test.js
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

let mod;

describe('recommendModel', () => {
  test('returns opus for debugging', async () => {
    mod = await import('../next-step-advisor.js');
    assert.equal(mod.recommendModel('debugging', { pressure: { tier: 'green' } }), 'opus');
  });

  test('returns sonnet for implementation', async () => {
    mod = await import('../next-step-advisor.js');
    assert.equal(mod.recommendModel('implementation', { pressure: { tier: 'green' } }), 'sonnet');
  });

  test('returns haiku for quick-lookup', async () => {
    mod = await import('../next-step-advisor.js');
    assert.equal(mod.recommendModel('general', { pressure: { tier: 'green' } }), 'sonnet');
  });

  test('downgrades opus to sonnet at yellow', async () => {
    mod = await import('../next-step-advisor.js');
    assert.equal(mod.recommendModel('debugging', { pressure: { tier: 'yellow' } }), 'sonnet');
  });

  test('downgrades all to haiku at red', async () => {
    mod = await import('../next-step-advisor.js');
    assert.equal(mod.recommendModel('debugging', { pressure: { tier: 'red' } }), 'haiku');
    assert.equal(mod.recommendModel('implementation', { pressure: { tier: 'red' } }), 'haiku');
  });
});

describe('quickHint', () => {
  test('suggests tests after Edit', async () => {
    mod = await import('../next-step-advisor.js');
    const h = mod.quickHint('Edit', 'ok:utils.js', { task_type: 'implementation' });
    assert.ok(h.includes('test'), `expected "test" in "${h}"`);
  });

  test('suggests fix after test failure', async () => {
    mod = await import('../next-step-advisor.js');
    const h = mod.quickHint('Bash', 'FAIL test_foo\n1 failing', { task_type: 'debugging' });
    assert.ok(h.includes('fix'), `expected "fix" in "${h}"`);
  });

  test('suggests commit after tests pass', async () => {
    mod = await import('../next-step-advisor.js');
    const h = mod.quickHint('Bash', 'pass 12\nfail 0\n', { task_type: 'implementation' });
    assert.ok(h.includes('commit'), `expected "commit" in "${h}"`);
  });

  test('suggests fix after build error', async () => {
    mod = await import('../next-step-advisor.js');
    const h = mod.quickHint('Bash', 'error TS2345: Argument of type\nBuild failed', { task_type: 'implementation' });
    assert.ok(h.includes('fix') || h.includes('build'), `expected fix/build in "${h}"`);
  });

  test('suggests push after commit', async () => {
    mod = await import('../next-step-advisor.js');
    const h = mod.quickHint('Bash', '[main abc1234] feat: add feature\n1 file changed', { task_type: 'implementation' });
    assert.ok(h.includes('push') || h.includes('PR'), `expected push/PR in "${h}"`);
  });

  test('returns empty when no signal', async () => {
    mod = await import('../next-step-advisor.js');
    const h = mod.quickHint('Read', 'some file content here\nline 2\n', { task_type: 'general' });
    assert.equal(h, '');
  });
});

describe('fullRecommendation', () => {
  test('suggests tests when code edited but no test run', async () => {
    mod = await import('../next-step-advisor.js');
    const records = [
      { tool_name: 'Edit', success: true, task_type: 'implementation' },
      { tool_name: 'Write', success: true, task_type: 'implementation' },
    ];
    const r = mod.fullRecommendation(records, { pressure: { tier: 'green' } });
    assert.ok(r.prompt.toLowerCase().includes('test'));
    assert.equal(r.model, 'sonnet');
    assert.ok(r.confidence > 0);
  });

  test('suggests commit when tests passed', async () => {
    mod = await import('../next-step-advisor.js');
    const records = [
      { tool_name: 'Edit', success: true, task_type: 'implementation' },
      { tool_name: 'Bash', success: true, task_type: 'implementation', pattern: 'test-pass' },
    ];
    const r = mod.fullRecommendation(records, { pressure: { tier: 'green' } });
    assert.ok(r.prompt.toLowerCase().includes('commit'));
  });

  test('suggests fix when tests failed', async () => {
    mod = await import('../next-step-advisor.js');
    const records = [
      { tool_name: 'Edit', success: true, task_type: 'debugging' },
      { tool_name: 'Bash', success: false, task_type: 'debugging', failure_mode: 'error-in-output' },
    ];
    const r = mod.fullRecommendation(records, { pressure: { tier: 'green' } });
    assert.ok(r.prompt.toLowerCase().includes('fix'));
  });

  test('downgrades model at red pressure', async () => {
    mod = await import('../next-step-advisor.js');
    const records = [
      { tool_name: 'Edit', success: true, task_type: 'debugging' },
    ];
    const r = mod.fullRecommendation(records, { pressure: { tier: 'red' } });
    assert.equal(r.model, 'haiku');
  });

  test('returns generic suggestion for empty records', async () => {
    mod = await import('../next-step-advisor.js');
    const r = mod.fullRecommendation([], { pressure: { tier: 'green' } });
    assert.ok(r.prompt.length > 0);
    assert.ok(r.confidence < 0.5);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test src/tests/next-step-advisor.test.js`
Expected: FAIL — `Cannot find module '../next-step-advisor.js'`

- [ ] **Step 3: Implement next-step-advisor.js**

```js
// src/next-step-advisor.js

// ── Model recommendation ─────────────────────────────────────────────────────

const TASK_MODEL_MAP = {
  debugging:        'opus',
  architecture:     'opus',
  'security-review': 'opus',
  implementation:   'sonnet',
  refactoring:      'sonnet',
  analysis:         'sonnet',
  general:          'sonnet',
};

const MODEL_RANK = ['haiku', 'sonnet', 'opus'];

function downgrade(model, steps = 1) {
  const idx = MODEL_RANK.indexOf(model);
  return MODEL_RANK[Math.max(0, idx - steps)] || 'haiku';
}

export function recommendModel(taskType, budget) {
  const tier = budget?.pressure?.tier || 'green';
  const base = TASK_MODEL_MAP[taskType] || 'sonnet';

  if (tier === 'red') return 'haiku';
  if (tier === 'yellow') return downgrade(base, 1);
  return base;
}

// ── Quick hints (per tool call) ──────────────────────────────────────────────

const EDIT_TOOLS = new Set(['Edit', 'Write']);
const TEST_PASS  = /(?:pass(?:ed|ing)?[\s:]+\d|✔|0 fail|\bpass\b.*\bfail 0\b)/i;
const TEST_FAIL  = /(?:fail(?:ed|ing|ure)?[\s:]+[1-9]|✗|FAIL\b|AssertionError)/i;
const BUILD_ERR  = /(?:error TS|Build failed|SyntaxError|Cannot find module|compilation failed)/i;
const COMMIT_OK  = /^\[[\w/.-]+\s+[0-9a-f]{7,}\]/m;

export function quickHint(toolName, toolOutput, promptBrief) {
  const output = String(toolOutput || '');

  // Edit/Write code file → suggest tests
  if (EDIT_TOOLS.has(toolName) && !/\.(md|json|txt)$/i.test(output)) {
    return 'Teneb hint: run tests';
  }

  // Bash: test results
  if (toolName === 'Bash') {
    if (TEST_FAIL.test(output)) return 'Teneb hint: fix failing test';
    if (TEST_PASS.test(output)) return 'Teneb hint: commit changes';
    if (BUILD_ERR.test(output)) return 'Teneb hint: fix build error';
    if (COMMIT_OK.test(output)) return 'Teneb hint: push or open PR';
  }

  return '';
}

// ── Full recommendation (end of session) ─────────────────────────────────────

export function fullRecommendation(sessionRecords, budget) {
  const records = sessionRecords || [];
  const tier = budget?.pressure?.tier || 'green';

  if (records.length === 0) {
    return {
      prompt: 'Review the project state and decide what to work on',
      model: recommendModel('general', budget),
      confidence: 0.3,
      reason: 'No tool activity recorded this session'
    };
  }

  const hasEdits    = records.some((r) => EDIT_TOOLS.has(r.tool_name));
  const hasFailure  = records.some((r) => !r.success || r.failure_mode);
  const hasTestPass = records.some((r) => r.tool_name === 'Bash' && r.success && r.pattern === 'test-pass');
  const hasTestRun  = records.some((r) => r.tool_name === 'Bash' && r.task_type !== 'general');
  const lastTask    = records[records.length - 1]?.task_type || 'general';

  // Priority 1: tests failed → fix them
  if (hasFailure) {
    return {
      prompt: 'Fix the failing tests or errors from this session',
      model: recommendModel('debugging', budget),
      confidence: 0.85,
      reason: 'Errors or test failures detected in session'
    };
  }

  // Priority 2: code edited + tests passed → commit
  if (hasEdits && hasTestPass) {
    return {
      prompt: 'Commit the changes and write a descriptive commit message',
      model: recommendModel('general', budget),
      confidence: 0.82,
      reason: 'Code was edited and tests passed — ready to commit'
    };
  }

  // Priority 3: code edited, no tests run → run tests
  if (hasEdits && !hasTestRun) {
    return {
      prompt: 'Run tests to verify the changes',
      model: recommendModel('implementation', budget),
      confidence: 0.78,
      reason: 'Code was edited but tests have not been run this session'
    };
  }

  // Priority 4: analysis / research → implement
  if (lastTask === 'analysis') {
    return {
      prompt: 'Implement the findings from the analysis',
      model: recommendModel('implementation', budget),
      confidence: 0.6,
      reason: 'Analysis completed — implementation is the natural next step'
    };
  }

  // Default
  return {
    prompt: 'Review what was done and plan the next step',
    model: recommendModel('general', budget),
    confidence: 0.4,
    reason: 'Session complete — review and plan next'
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test src/tests/next-step-advisor.test.js`
Expected: All 16 tests PASS.

- [ ] **Step 5: Run full suite**

Run: `npm test`
Expected: All tests pass (98 existing + 16 new = 114+).

- [ ] **Step 6: Commit**

```bash
git add src/next-step-advisor.js src/tests/next-step-advisor.test.js
git commit -m "feat: add next-step advisor with model recommendation"
```

---

### Task 2: Wire PostToolUse quickHint

**Files:**
- Modify: `.claude/hooks/post-tool-use.js`

- [ ] **Step 1: Read the current file to see where to add the hint**

Read `.claude/hooks/post-tool-use.js`. The file ends with a `process.stdout.write(JSON.stringify({ decision: 'continue', hookSpecificOutput: { ... } }))`. The `additionalContext` field is an array joined with `\n`.

- [ ] **Step 2: Add import**

Add after existing imports:

```js
import { quickHint } from '../../src/next-step-advisor.js';
```

- [ ] **Step 3: Add hint to additionalContext**

Before the final `process.stdout.write(...)`, compute the hint:

```js
const hint = quickHint(toolName, outputStr, brief);
```

Then in the `additionalContext` array inside the JSON output, append the hint if non-empty. Change the array from:

```js
    additionalContext: [
      `Teneb compressed tool output from ~${compacted.stats.before_tokens} to ~${compacted.stats.after_tokens} tokens.`,
      `Key summary: ${compacted.compacted}`
    ].join('\n'),
```

to:

```js
    additionalContext: [
      `Teneb compressed tool output from ~${compacted.stats.before_tokens} to ~${compacted.stats.after_tokens} tokens.`,
      `Key summary: ${compacted.compacted}`,
      ...(hint ? [hint] : [])
    ].join('\n'),
```

- [ ] **Step 4: Run full suite**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add .claude/hooks/post-tool-use.js
git commit -m "feat: add quickHint to post-tool-use additionalContext"
```

---

### Task 3: Wire Stop hook fullRecommendation

**Files:**
- Modify: `.claude/hooks/stop.js`

- [ ] **Step 1: Read current stop.js**

Currently: reads stdin, checks if `final_text` > 1800 chars → block or continue. Very minimal.

- [ ] **Step 2: Add imports and recommendation logic**

Rewrite `stop.js` to add the recommendation while preserving existing length check:

```js
#!/usr/bin/env node
import { LearningStore } from '../../src/learning-store.js';
import { loadProjectConfig } from '../../src/config.js';
import { loadBudget } from '../../src/token-budget.js';
import { fullRecommendation } from '../../src/next-step-advisor.js';

const input = await (async () => {
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  try { return data ? JSON.parse(data) : {}; }
  catch { return {}; }
})();

const text = String(input.final_text || input.output || input.result || '');

// Existing length guard
if (text.length > 1800) {
  process.stdout.write(JSON.stringify({
    decision: 'block',
    reason: 'Teneb stop hook rejected an overlong response; compress and retry.',
    hookSpecificOutput: {
      hookEventName: 'Stop',
      additionalContext: 'Response should be shorter and more focused.'
    }
  }, null, 2));
} else {
  // Generate next-step recommendation
  const projectDir = input.cwd || process.cwd();
  const config = loadProjectConfig(projectDir);
  const store = new LearningStore(config.learningFile);
  const budget = loadBudget(projectDir, {
    green: config.budget?.green_threshold,
    yellow: config.budget?.yellow_threshold
  });
  const records = store.readAll().slice(-50);
  const rec = fullRecommendation(records, budget);

  if (rec.prompt) {
    process.stderr.write([
      '',
      '── Teneb Suggestion ────────────────────────',
      `  Next: ${rec.prompt}`,
      `  Model: ${rec.model} (confidence: ${(rec.confidence * 100).toFixed(0)}%)`,
      `  Why: ${rec.reason}`,
      '────────────────────────────────────────────',
      ''
    ].join('\n'));
  }

  process.stdout.write(JSON.stringify({
    continue: true,
    systemMessage: 'Teneb stop hook verified the response.'
  }, null, 2));
}
```

- [ ] **Step 3: Run full suite**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add .claude/hooks/stop.js
git commit -m "feat: add fullRecommendation to stop hook"
```

---

### Task 4: Integration Smoke Test

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass (98 + 16 = 114+).

- [ ] **Step 2: Smoke test quickHint**

```bash
node -e "
import { quickHint } from './src/next-step-advisor.js';
console.log(quickHint('Edit', 'ok:utils.js', { task_type: 'implementation' }));
console.log(quickHint('Bash', 'pass 12\nfail 0', { task_type: 'implementation' }));
console.log(quickHint('Bash', 'FAIL test_foo', { task_type: 'debugging' }));
console.log(quickHint('Read', 'some content', { task_type: 'general' }));
"
```

Expected:
```
Teneb hint: run tests
Teneb hint: commit changes
Teneb hint: fix failing test
(empty line)
```

- [ ] **Step 3: Smoke test fullRecommendation**

```bash
node -e "
import { fullRecommendation } from './src/next-step-advisor.js';
console.log(fullRecommendation([
  { tool_name: 'Edit', success: true, task_type: 'implementation' }
], { pressure: { tier: 'green' } }));
console.log(fullRecommendation([], { pressure: { tier: 'red' } }));
"
```

Expected: objects with `prompt`, `model`, `confidence`, `reason` fields.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: auto-recommend next steps + model selection — complete"
```
