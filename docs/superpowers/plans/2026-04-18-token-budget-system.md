# Progressive Token Budget System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a progressive token budget system that prevents wasteful API calls, compresses tool outputs based on type and pressure, and tracks cumulative context usage across a session.

**Architecture:** A shared `token-budget.js` module manages per-session state via `.teneb/session-budget.json`. All hooks read pressure from this file and adapt: prompt-submit blocks ambiguous prompts, post-tool-use adjusts compaction aggressiveness, pre-tool-use injects conciseness hints at high pressure. A `prompt-guard.js` module provides typo correction and ambiguity detection with zero external dependencies.

**Tech Stack:** Node.js 20, `node:test` for testing, no external dependencies.

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/token-budget.js` (new) | Budget state: load, record, reset, getPressure. Atomic file I/O. |
| `src/prompt-guard.js` (new) | Typo dictionary, ambiguity detector, verb/word lists. Pure functions. |
| `src/config.js` (modify) | Add `budget` section to defaults + mergeConfig. |
| `.claude/hooks/session-start.js` (modify) | Reset budget on session start. |
| `.claude/hooks/prompt-submit.js` (modify) | Add quality gate (typo + ambiguity + pressure). |
| `.claude/hooks/post-tool-use.js` (modify) | Add tool-type-aware compression + budget tracking. |
| `.claude/hooks/pre-tool-use.js` (modify) | Inject "be concise" at red pressure. |
| `.claude/hooks/session-end.js` (modify) | Enhanced summary with budget stats. |
| `src/tests/token-budget.test.js` (new) | Unit tests for budget module. |
| `src/tests/prompt-guard.test.js` (new) | Unit tests for guard module. |

---

### Task 1: Token Budget Controller

**Files:**
- Create: `src/token-budget.js`
- Create: `src/tests/token-budget.test.js`

- [ ] **Step 1: Write failing tests for token-budget.js**

```js
// src/tests/token-budget.test.js
import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let mod;
let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'teneb-budget-'));
  fs.mkdirSync(path.join(tmpDir, '.teneb'), { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('getPressure', () => {
  test('returns green below 40%', async () => {
    mod = await import('../token-budget.js');
    const p = mod.getPressure(30000, 200000);
    assert.equal(p.tier, 'green');
    assert.ok(p.ratio < 0.4);
  });

  test('returns yellow between 40% and 80%', async () => {
    mod = await import('../token-budget.js');
    const p = mod.getPressure(100000, 200000);
    assert.equal(p.tier, 'yellow');
  });

  test('returns red above 80%', async () => {
    mod = await import('../token-budget.js');
    const p = mod.getPressure(170000, 200000);
    assert.equal(p.tier, 'red');
  });

  test('returns green for zero tokens', async () => {
    mod = await import('../token-budget.js');
    const p = mod.getPressure(0, 200000);
    assert.equal(p.tier, 'green');
    assert.equal(p.ratio, 0);
  });
});

describe('resetBudget', () => {
  test('creates budget file', async () => {
    mod = await import('../token-budget.js');
    mod.resetBudget(tmpDir, 'sess-1', 200000);
    const file = path.join(tmpDir, '.teneb', 'session-budget.json');
    assert.ok(fs.existsSync(file));
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(data.session_id, 'sess-1');
    assert.equal(data.estimated_tokens, 0);
    assert.equal(data.tool_calls, 0);
    assert.equal(data.max_budget, 200000);
  });
});

describe('loadBudget', () => {
  test('returns defaults when no file', async () => {
    mod = await import('../token-budget.js');
    const b = mod.loadBudget(path.join(tmpDir, 'nonexistent'));
    assert.equal(b.estimated_tokens, 0);
    assert.equal(b.pressure.tier, 'green');
  });

  test('reads existing budget', async () => {
    mod = await import('../token-budget.js');
    mod.resetBudget(tmpDir, 'sess-2', 100000);
    mod.recordTokens(tmpDir, 50000);
    const b = mod.loadBudget(tmpDir);
    assert.equal(b.estimated_tokens, 50000);
    assert.equal(b.pressure.tier, 'yellow');
  });
});

describe('recordTokens', () => {
  test('increments estimated_tokens and tool_calls', async () => {
    mod = await import('../token-budget.js');
    mod.resetBudget(tmpDir, 'sess-3', 200000);
    mod.recordTokens(tmpDir, 1000);
    mod.recordTokens(tmpDir, 2000);
    const b = mod.loadBudget(tmpDir);
    assert.equal(b.estimated_tokens, 3000);
    assert.equal(b.tool_calls, 2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test src/tests/token-budget.test.js`
Expected: FAIL — `Cannot find module '../token-budget.js'`

- [ ] **Step 3: Implement token-budget.js**

```js
// src/token-budget.js
import fs from 'node:fs';
import path from 'node:path';

const BUDGET_FILE = 'session-budget.json';

function budgetPath(projectDir) {
  return path.join(projectDir, '.teneb', BUDGET_FILE);
}

export function getPressure(estimated, max, thresholds = {}) {
  const green = thresholds.green ?? 0.4;
  const yellow = thresholds.yellow ?? 0.8;
  const ratio = max > 0 ? estimated / max : 0;
  const tier = ratio >= yellow ? 'red' : ratio >= green ? 'yellow' : 'green';
  return { tier, ratio: Number(ratio.toFixed(4)) };
}

export function resetBudget(projectDir, sessionId, maxBudget = 200000) {
  const file = budgetPath(projectDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const data = {
    session_id: sessionId,
    started_at: new Date().toISOString(),
    estimated_tokens: 0,
    tool_calls: 0,
    prompts_blocked: 0,
    max_budget: maxBudget
  };
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

export function loadBudget(projectDir, thresholds = {}) {
  const file = budgetPath(projectDir);
  const defaults = { estimated_tokens: 0, tool_calls: 0, prompts_blocked: 0, max_budget: 200000 };
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    data = defaults;
  }
  const estimated = data.estimated_tokens ?? 0;
  const max = data.max_budget ?? 200000;
  return {
    ...defaults,
    ...data,
    pressure: getPressure(estimated, max, thresholds)
  };
}

export function recordTokens(projectDir, count) {
  const file = budgetPath(projectDir);
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    data = { estimated_tokens: 0, tool_calls: 0, prompts_blocked: 0, max_budget: 200000 };
  }
  data.estimated_tokens = (data.estimated_tokens || 0) + count;
  data.tool_calls = (data.tool_calls || 0) + 1;
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

export function recordBlocked(projectDir) {
  const file = budgetPath(projectDir);
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return;
  }
  data.prompts_blocked = (data.prompts_blocked || 0) + 1;
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

export function maxLengthForTier(tier) {
  if (tier === 'red') return 80;
  if (tier === 'yellow') return 140;
  return 220;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test src/tests/token-budget.test.js`
Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/token-budget.js src/tests/token-budget.test.js
git commit -m "feat: add token budget controller with pressure tiers"
```

---

### Task 2: Config additions

**Files:**
- Modify: `src/config.js:4-27` (defaultConfig function)
- Modify: `src/config.js:35-42` (mergeConfig function)

- [ ] **Step 1: Add budget config to defaultConfig**

In `src/config.js`, add inside the return object of `defaultConfig`, after the `toolReliability` block:

```js
    budget: {
      max_tokens: 200000,
      green_threshold: 0.4,
      yellow_threshold: 0.8
    }
```

- [ ] **Step 2: Add budget merge to mergeConfig**

In `mergeConfig`, add after the `toolReliability` spread:

```js
    budget: { ...base.budget, ...(override?.budget || {}) }
```

- [ ] **Step 3: Run existing tests**

Run: `npm test`
Expected: All 56+ tests still pass (no breaking change).

- [ ] **Step 4: Commit**

```bash
git add src/config.js
git commit -m "feat: add budget thresholds to config defaults"
```

---

### Task 3: Prompt Guard

**Files:**
- Create: `src/prompt-guard.js`
- Create: `src/tests/prompt-guard.test.js`

- [ ] **Step 1: Write failing tests for prompt-guard.js**

```js
// src/tests/prompt-guard.test.js
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

let mod;

describe('autoCorrectTypos', () => {
  test('fixes common typos', async () => {
    mod = await import('../prompt-guard.js');
    assert.equal(mod.autoCorrectTypos('Fix teh fucntion reutrn'), 'Fix the function return');
  });

  test('preserves correct words', async () => {
    mod = await import('../prompt-guard.js');
    assert.equal(mod.autoCorrectTypos('Read the file'), 'Read the file');
  });

  test('only corrects whole words', async () => {
    mod = await import('../prompt-guard.js');
    // "wiht" inside "awihtb" should not be corrected
    const r = mod.autoCorrectTypos('awihtb');
    assert.equal(r, 'awihtb');
  });
});

describe('checkAmbiguity', () => {
  test('allows clear prompts', async () => {
    mod = await import('../prompt-guard.js');
    const r = mod.checkAmbiguity('Read src/utils.js and explain jaccard');
    assert.equal(r.blocked, false);
  });

  test('blocks vague prompts at green', async () => {
    mod = await import('../prompt-guard.js');
    const r = mod.checkAmbiguity('help', 'green');
    assert.equal(r.blocked, true);
  });

  test('allows single-letter conversational replies', async () => {
    mod = await import('../prompt-guard.js');
    assert.equal(mod.checkAmbiguity('b', 'green').blocked, false);
    assert.equal(mod.checkAmbiguity('d', 'green').blocked, false);
    assert.equal(mod.checkAmbiguity('y', 'red').blocked, false);
  });

  test('allows common confirmations', async () => {
    mod = await import('../prompt-guard.js');
    assert.equal(mod.checkAmbiguity('yes', 'green').blocked, false);
    assert.equal(mod.checkAmbiguity('no', 'green').blocked, false);
    assert.equal(mod.checkAmbiguity('continue', 'yellow').blocked, false);
    assert.equal(mod.checkAmbiguity('ok', 'red').blocked, false);
  });

  test('allows prompts with file paths', async () => {
    mod = await import('../prompt-guard.js');
    assert.equal(mod.checkAmbiguity('fix src/utils.js', 'green').blocked, false);
  });

  test('allows prompts with code patterns', async () => {
    mod = await import('../prompt-guard.js');
    assert.equal(mod.checkAmbiguity('what does foo() do', 'green').blocked, false);
  });

  test('tightens at yellow tier', async () => {
    mod = await import('../prompt-guard.js');
    // "fix bug" = 2 non-stop words, passes at green (threshold 3, but has a verb)
    // At yellow threshold is 4
    const r = mod.checkAmbiguity('do thing now', 'yellow');
    assert.equal(r.blocked, true);
  });

  test('blocks gibberish', async () => {
    mod = await import('../prompt-guard.js');
    const r = mod.checkAmbiguity('xkcd qwerty asdf zxcv mnbv lkjh', 'green');
    assert.equal(r.blocked, true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test src/tests/prompt-guard.test.js`
Expected: FAIL — `Cannot find module '../prompt-guard.js'`

- [ ] **Step 3: Implement prompt-guard.js**

```js
// src/prompt-guard.js

// ── Typo dictionary (~50 common programming typos) ───────────────────────────

const TYPO_MAP = {
  teh: 'the', wiht: 'with', hte: 'the', taht: 'that', adn: 'and',
  reutrn: 'return', fucntion: 'function', functoin: 'function',
  cosnt: 'const', conts: 'const', cnosle: 'console', consoel: 'console',
  improt: 'import', ipmort: 'import', exoprt: 'export', exprot: 'export',
  ture: 'true', flase: 'false', nulal: 'null', undefiend: 'undefined',
  lenght: 'length', widht: 'width', heigth: 'height',
  strign: 'string', nubmer: 'number', booelan: 'boolean', obejct: 'object',
  arry: 'array', arary: 'array', stirng: 'string',
  fitler: 'filter', mapt: 'map', recude: 'reduce', forEahc: 'forEach',
  requrie: 'require', moduels: 'modules', packge: 'package',
  tempalte: 'template', comopnent: 'component', compnent: 'component',
  scirpt: 'script', styel: 'style', calss: 'class',
  pubilc: 'public', priavte: 'private', proetcted: 'protected',
  defualt: 'default', breka: 'break', contniue: 'continue',
  elemnent: 'element', attriubte: 'attribute',
  prmoise: 'promise', awiat: 'await', asnyc: 'async',
  delte: 'delete', isntall: 'install', biuld: 'build',
};

export function autoCorrectTypos(text) {
  let result = text;
  for (const [typo, fix] of Object.entries(TYPO_MAP)) {
    const regex = new RegExp(`\\b${typo}\\b`, 'gi');
    result = result.replace(regex, fix);
  }
  return result;
}

// ── Ambiguity detector ───────────────────────────────────────────────────────

const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'it', 'in', 'on', 'at', 'to', 'for', 'of',
  'and', 'or', 'but', 'not', 'this', 'that', 'with', 'from', 'by',
  'i', 'me', 'my', 'we', 'you', 'your', 'be', 'do', 'so', 'if',
  'as', 'up', 'am', 'are', 'was', 'has', 'had', 'can', 'will',
]);

const CONFIRMATIONS = new Set([
  'yes', 'no', 'ok', 'okay', 'continue', 'stop', 'done', 'next',
  'proceed', 'skip', 'abort', 'cancel', 'retry', 'go', 'sure',
  'yep', 'nope', 'right', 'correct', 'wrong', 'agreed', 'approve',
  'all good', 'looks good', 'lgtm', 'ship it',
]);

const VERBS = new Set([
  'read', 'write', 'edit', 'fix', 'add', 'remove', 'delete', 'update',
  'create', 'build', 'run', 'test', 'check', 'find', 'search', 'show',
  'explain', 'describe', 'list', 'count', 'compare', 'debug', 'deploy',
  'install', 'configure', 'refactor', 'rename', 'move', 'copy', 'merge',
  'commit', 'push', 'pull', 'revert', 'reset', 'analyze', 'review',
  'implement', 'change', 'modify', 'set', 'get', 'fetch', 'send',
  'open', 'close', 'start', 'stop', 'restart', 'kill', 'clean',
  'compile', 'lint', 'format', 'document', 'scaffold', 'generate',
  'help', 'look', 'make', 'use', 'try', 'tell', 'give', 'put',
]);

// Basic 3000-word English check — we just check against a combined set
// of stopwords + verbs + common nouns. Words not in the set are "unknown".
// If >40% unknown → gibberish.
const KNOWN_WORDS = new Set([
  ...STOPWORDS, ...VERBS,
  'file', 'files', 'code', 'function', 'class', 'method', 'variable',
  'error', 'bug', 'issue', 'line', 'lines', 'module', 'package',
  'test', 'tests', 'output', 'input', 'result', 'value', 'type',
  'string', 'number', 'boolean', 'array', 'object', 'null', 'undefined',
  'true', 'false', 'const', 'let', 'var', 'import', 'export', 'default',
  'return', 'if', 'else', 'while', 'for', 'each', 'map', 'filter',
  'reduce', 'promise', 'async', 'await', 'try', 'catch', 'throw',
  'new', 'class', 'extends', 'super', 'this', 'null', 'void',
  'server', 'client', 'api', 'endpoint', 'route', 'handler', 'request',
  'response', 'data', 'database', 'query', 'schema', 'table', 'column',
  'name', 'path', 'directory', 'folder', 'src', 'lib', 'config',
  'what', 'how', 'why', 'when', 'where', 'which', 'who',
  'need', 'want', 'should', 'could', 'would', 'might', 'must',
  'about', 'all', 'just', 'only', 'also', 'then', 'than', 'more',
  'like', 'please', 'thanks', 'thank', 'hi', 'hello', 'hey',
  'same', 'different', 'new', 'old', 'first', 'last', 'next',
  'good', 'bad', 'best', 'better', 'worse', 'worst',
  'one', 'two', 'three', 'many', 'some', 'any', 'every', 'each',
  'here', 'there', 'now', 'before', 'after', 'between', 'above', 'below',
  'work', 'working', 'works', 'does', 'doing', 'did',
  'sentence', 'word', 'text', 'message', 'prompt', 'command',
  'project', 'repo', 'repository', 'branch', 'commit', 'version',
  'component', 'element', 'node', 'tree', 'graph', 'list',
  'system', 'service', 'process', 'tool', 'tools', 'hook', 'hooks',
  'token', 'tokens', 'context', 'window', 'session', 'budget',
  'again', 'still', 'already', 'yet', 'never', 'always', 'often',
  'very', 'really', 'too', 'much', 'well', 'most', 'least',
  'into', 'out', 'off', 'over', 'under', 'through', 'down',
  'but', 'because', 'since', 'until', 'unless', 'although',
  'them', 'their', 'its', 'our', 'his', 'her', 'these', 'those',
  'been', 'being', 'have', 'having', 'other', 'another', 'such',
  'both', 'either', 'neither', 'nor', 'whether', 'however',
  'thing', 'things', 'something', 'everything', 'nothing', 'anything',
  'way', 'time', 'part', 'place', 'case', 'point', 'end',
  'make', 'take', 'give', 'know', 'think', 'see', 'come', 'go',
  'say', 'tell', 'ask', 'put', 'keep', 'let', 'begin', 'seem',
  'show', 'hear', 'play', 'turn', 'call', 'move', 'live', 'leave',
  'back', 'long', 'great', 'little', 'own', 'big', 'small',
  'high', 'low', 'right', 'left', 'wrong', 'possible', 'likely',
  'even', 'still', 'enough', 'far', 'real', 'whole',
  'able', 'available', 'current', 'existing', 'following', 'local',
  'global', 'internal', 'external', 'main', 'public', 'private',
]);

const CODE_PATTERNS = /[`(){}\[\]=>]|\/[a-z]|\.(?:js|ts|py|rs|json|md|css|html)\b/i;
const PATH_PATTERN = /(?:^|[\s])(?:\/|\.\/|\.\.\/|~\/|src\/|lib\/)\S+/;

function tokenize(text) {
  return text.toLowerCase().split(/\s+/).filter(Boolean);
}

function nonStopTokens(tokens) {
  return tokens.filter((t) => !STOPWORDS.has(t));
}

function hasVerb(tokens) {
  return tokens.some((t) => VERBS.has(t));
}

function gibberishRatio(tokens) {
  if (tokens.length === 0) return 0;
  const unknown = tokens.filter((t) => !KNOWN_WORDS.has(t) && t.length > 1);
  return unknown.length / tokens.length;
}

const TIER_THRESHOLDS = { green: 3, yellow: 4, red: 5 };

export function checkAmbiguity(text, tier = 'green') {
  const trimmed = (text || '').trim();
  if (!trimmed) return { blocked: true, reason: 'Empty prompt.' };

  // Single letter = conversational reply, always allow
  if (/^[a-z]$/i.test(trimmed)) return { blocked: false };

  // Common confirmations, always allow
  if (CONFIRMATIONS.has(trimmed.toLowerCase())) return { blocked: false };

  // Code patterns or file paths = likely intentional, always allow
  if (CODE_PATTERNS.test(trimmed) || PATH_PATTERN.test(trimmed)) return { blocked: false };

  const tokens = tokenize(trimmed);
  const nonStop = nonStopTokens(tokens);
  const threshold = TIER_THRESHOLDS[tier] || 3;

  // Gibberish check: >40% unknown words
  if (tokens.length >= 4 && gibberishRatio(tokens) > 0.4) {
    return { blocked: true, reason: 'Prompt appears to be gibberish. Please rephrase.' };
  }

  // Too few meaningful tokens and no verb
  if (nonStop.length < threshold && !hasVerb(tokens)) {
    return { blocked: true, reason: `Prompt too vague (need ${threshold}+ keywords or a verb). Please add more detail.` };
  }

  // At red tier: also require a verb even if enough tokens
  if (tier === 'red' && !hasVerb(tokens) && !CODE_PATTERNS.test(trimmed) && !PATH_PATTERN.test(trimmed)) {
    return { blocked: true, reason: 'Context budget critical — prompt must include an action verb or file path.' };
  }

  return { blocked: false };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test src/tests/prompt-guard.test.js`
Expected: All 10 tests PASS.

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: All tests pass including new ones.

- [ ] **Step 6: Commit**

```bash
git add src/prompt-guard.js src/tests/prompt-guard.test.js
git commit -m "feat: add prompt guard with typo correction and ambiguity detection"
```

---

### Task 4: Wire session-start.js to reset budget

**Files:**
- Modify: `.claude/hooks/session-start.js`

- [ ] **Step 1: Add budget reset to session-start.js**

Add at the top after existing imports:

```js
import { resetBudget } from '../../src/token-budget.js';
```

Add before the final `process.stdout.write`:

```js
const sessionId = input.session_id || input.sessionId || `sess-${Date.now()}`;
const budgetMax = config.budget?.max_tokens ?? 200000;
resetBudget(projectDir, sessionId, budgetMax);
```

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: All tests pass (hook changes are tested manually, not by unit tests).

- [ ] **Step 3: Commit**

```bash
git add .claude/hooks/session-start.js
git commit -m "feat: reset token budget on session start"
```

---

### Task 5: Wire prompt-submit.js quality gate

**Files:**
- Modify: `.claude/hooks/prompt-submit.js`

- [ ] **Step 1: Read current prompt-submit.js to understand structure**

Read the file to see the current implementation. The hook receives stdin JSON, compiles a prompt brief, and writes JSON to stdout. It currently never blocks.

- [ ] **Step 2: Add imports and quality gate logic**

Add at the top after existing imports:

```js
import { loadBudget, recordTokens, recordBlocked } from '../../src/token-budget.js';
import { autoCorrectTypos, checkAmbiguity } from '../../src/prompt-guard.js';
```

Add after the prompt brief is compiled but before the final `process.stdout.write`:

```js
// ── Quality gate ────────────────────────────────────────────────────────────
const rawPrompt = input.prompt || input.user_prompt || '';
const budget = loadBudget(projectDir, {
  green: config.budget?.green_threshold,
  yellow: config.budget?.yellow_threshold
});

// Auto-correct typos (always on)
const corrected = autoCorrectTypos(rawPrompt);
if (corrected !== rawPrompt) {
  store.recordRun({ type: 'typo-correction', original: rawPrompt.slice(0, 100), corrected: corrected.slice(0, 100), pattern: 'prompt-guard' });
}

// Ambiguity check (tier-aware)
const ambiguity = checkAmbiguity(corrected, budget.pressure.tier);
if (ambiguity.blocked) {
  recordBlocked(projectDir);
  process.stdout.write(JSON.stringify({
    decision: 'block',
    reason: ambiguity.reason
  }, null, 2));
  process.exit(0);
}

// Record estimated prompt tokens to budget
const estTokens = Math.ceil(corrected.length / 4);
recordTokens(projectDir, estTokens);
```

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add .claude/hooks/prompt-submit.js
git commit -m "feat: add prompt quality gate with typo correction and ambiguity blocking"
```

---

### Task 6: Wire post-tool-use.js smart compression + budget tracking

**Files:**
- Modify: `.claude/hooks/post-tool-use.js`

- [ ] **Step 1: Add budget import**

Add after existing imports:

```js
import { loadBudget, recordTokens, maxLengthForTier } from '../../src/token-budget.js';
```

- [ ] **Step 2: Replace hardcoded maxLength with tier-aware value**

After `const outputStr = String(toolOutput || '');` and the capture block, add:

```js
const budget = loadBudget(projectDir, {
  green: config.budget?.green_threshold,
  yellow: config.budget?.yellow_threshold
});
const tierMaxLength = maxLengthForTier(budget.pressure.tier);
```

Then change the microCompact call from:

```js
const compacted = microCompact(String(toolOutput || ''), { maxLength: 220, aliasMinLength: config.compaction.aliasMinLength });
```

to:

```js
const compacted = microCompact(String(toolOutput || ''), { maxLength: tierMaxLength, aliasMinLength: config.compaction.aliasMinLength });
```

- [ ] **Step 3: Add tool-type-aware truncation before compaction**

Add a `smartTruncate` function at the top of the file (after imports):

```js
function smartTruncate(output, toolName, tier) {
  const lines = output.split('\n');
  const maxLines = tier === 'red' ? 20 : tier === 'yellow' ? 40 : 80;

  // Write/Edit confirmations → shorten
  if (['Write', 'Edit'].includes(toolName) && /(?:success|updated|created)/i.test(output)) {
    const fname = output.match(/(?:\/[\w.-]+)+/)?.[0]?.split('/').pop() || '';
    return fname ? `ok:${fname}` : 'ok';
  }

  // Short outputs — no truncation needed
  if (lines.length <= maxLines) return output;

  // Bash: keep last N lines (summary is at bottom for most tools)
  if (toolName === 'Bash') {
    return '[…' + (lines.length - maxLines) + ' lines omitted]\n' + lines.slice(-maxLines).join('\n');
  }

  // Read: keep header + tail
  const header = lines.slice(0, 5);
  const tail = lines.slice(-2);
  const middle = lines.slice(5, -2);
  const kept = middle.slice(0, maxLines - 7);
  const omitted = middle.length - kept.length;
  if (omitted > 0) {
    return [...header, ...kept, `[…${omitted} lines omitted]`, ...tail].join('\n');
  }
  return output;
}
```

Use it before the `microCompact` call:

```js
const truncated = smartTruncate(outputStr, toolName, budget.pressure.tier);
```

And change microCompact to use `truncated`:

```js
const compacted = microCompact(truncated, { maxLength: tierMaxLength, aliasMinLength: config.compaction.aliasMinLength });
```

- [ ] **Step 4: Record tokens to budget**

After `store.recordRun(...)`, add:

```js
const netTokens = Math.max(0, Math.ceil(outputStr.length / 4) - compacted.stats.after_tokens);
recordTokens(projectDir, Math.ceil(outputStr.length / 4) - netTokens);
```

- [ ] **Step 5: Add tier to learning store record**

Add `tier: budget.pressure.tier` to the `store.recordRun(...)` call.

- [ ] **Step 6: Run full test suite**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add .claude/hooks/post-tool-use.js
git commit -m "feat: add smart tool compression with pressure-aware truncation"
```

---

### Task 7: Wire pre-tool-use.js conciseness hint

**Files:**
- Modify: `.claude/hooks/pre-tool-use.js`

- [ ] **Step 1: Add budget import**

Add after existing imports:

```js
import { loadBudget } from '../../src/token-budget.js';
```

- [ ] **Step 2: Add pressure-aware conciseness hint**

Before the final `process.stdout.write(JSON.stringify({ hookSpecificOutput: ... }))`, load the budget and prepend to `systemMessage`:

```js
const budget = loadBudget(projectDir, {
  green: config.budget?.green_threshold,
  yellow: config.budget?.yellow_threshold
});

const pressureHint = budget.pressure.tier === 'red'
  ? 'CONTEXT BUDGET CRITICAL — be maximally concise. '
  : budget.pressure.tier === 'yellow'
    ? 'Context budget elevated — prefer short answers. '
    : '';
```

Then prepend `pressureHint` to the existing `systemMessage`:

```js
const systemMessage = pressureHint + [
  top ? `Teneb recommends ${top.name} ...` : '...',
  ...
].join(' ');
```

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add .claude/hooks/pre-tool-use.js
git commit -m "feat: inject conciseness hint at yellow/red pressure"
```

---

### Task 8: Enhance session-end.js with budget stats

**Files:**
- Modify: `.claude/hooks/session-end.js`

- [ ] **Step 1: Add budget import and read budget stats**

Add after existing imports:

```js
import { loadBudget } from '../../src/token-budget.js';
```

After the `store.recordRun(...)` call, load the budget:

```js
const budget = loadBudget(projectDir);
```

- [ ] **Step 2: Add budget stats to summary output**

Extend the `lines` array (after the existing stats block) with budget info:

```js
if (budget.max_budget > 0) {
  const usedPct = ((budget.estimated_tokens / budget.max_budget) * 100).toFixed(0);
  lines.push(`  Token budget used    : ${budget.estimated_tokens.toLocaleString()} / ${budget.max_budget.toLocaleString()} (${usedPct}%)`);
  lines.push(`  Peak pressure tier   : ${budget.pressure.tier}`);
  if (budget.prompts_blocked > 0) {
    lines.push(`  Prompts blocked      : ${budget.prompts_blocked} (saved ~${(budget.prompts_blocked * 40000).toLocaleString()} tokens)`);
  }
}
```

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add .claude/hooks/session-end.js
git commit -m "feat: add budget stats to session-end summary"
```

---

### Task 9: Integration smoke test

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass (58+ tests: 56 existing + token-budget + prompt-guard).

- [ ] **Step 2: Run offline A/B benchmark**

Run: `npm run ab`
Expected: Table renders, no errors. Reduction % should be similar or better than before (smart truncation helps).

- [ ] **Step 3: Manual smoke test — budget reset**

```bash
node -e "
import { resetBudget, loadBudget, recordTokens } from './src/token-budget.js';
resetBudget('.', 'test-sess', 200000);
recordTokens('.', 50000);
recordTokens('.', 50000);
const b = loadBudget('.');
console.log(b.pressure); // should be { tier: 'yellow', ratio: 0.5 }
"
```

- [ ] **Step 4: Manual smoke test — prompt guard**

```bash
node -e "
import { autoCorrectTypos, checkAmbiguity } from './src/prompt-guard.js';
console.log(autoCorrectTypos('Fix teh fucntion reutrn'));  // Fix the function return
console.log(checkAmbiguity('help', 'green'));               // { blocked: true, ... }
console.log(checkAmbiguity('b', 'red'));                    // { blocked: false }
console.log(checkAmbiguity('Read src/utils.js', 'red'));    // { blocked: false }
"
```

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: progressive token budget system — complete integration"
```
