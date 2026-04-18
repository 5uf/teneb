# Teneb: Auto-Recommend Next Steps + Model Selection

**Date:** 2026-04-18
**Status:** Approved

---

## Problem

After Claude finishes a task, users must decide what to do next and which model to use. Teneb has session history and tool usage data but doesn't use it to guide the user's next action.

## Goals

1. After every tool call, provide a light 1-line hint about the likely next step
2. At session Stop, provide a full recommendation: what prompt to run next + which model
3. Use context analysis (files changed, errors, tests) to generate intelligent suggestions
4. Factor in budget pressure when recommending models (downgrade at yellow/red)

## Out of Scope

- Executing the recommended prompt automatically (recommendation only)
- External ML models or APIs (all rule-based heuristics)
- Retraining or fine-tuning from user behavior (just log follow-through for future use)

---

## Part 1: Next-Step Advisor Module

### File

`src/next-step-advisor.js`

### API

| Function | Called by | Returns |
|----------|----------|---------|
| `quickHint(toolName, toolOutput, promptBrief)` | PostToolUse hook | `string` — 1-line hint or empty string |
| `fullRecommendation(sessionRecords, budget)` | Stop hook | `{ prompt, model, confidence, reason }` |
| `recommendModel(taskType, budget, learningStore?)` | Internal | `'haiku' \| 'sonnet' \| 'opus'` |

### Quick Hints — Rule Engine

After each tool call, analyze what happened and suggest the natural next step:

| Condition | Hint |
|-----------|------|
| Edit/Write completed (code file) | "Next: run tests" |
| Bash test run → failures detected | "Next: fix failing test" |
| Bash test run → all pass | "Next: commit changes" |
| Read completed (large file) | "Next: identify the relevant section" |
| Bash build → error output | "Next: fix build error" |
| Bash git commit → success | "Next: push or open PR" |
| No strong signal | Return empty string (no hint) |

Detection: regex on `toolName` + `toolOutput` patterns.

Hint format injected into PostToolUse `additionalContext`:
```
Teneb hint: run tests (recommended: sonnet)
```

### Full Recommendation — Context Analysis

At Stop, analyze the full session:

**Input signals:**
- `sessionRecords` from learning store (tool_name, task_type, success, tokens_saved)
- `budget` from token-budget (pressure tier, estimated_tokens)
- Derived: files changed (from Edit/Write records), test status (from Bash records), errors encountered

**Decision rules (priority order):**
1. Uncommitted code changes detected + tests passed → suggest "commit changes"
2. Tests failed in session → suggest "fix failing tests"
3. Build errors unresolved → suggest "fix build errors"
4. Code written but no tests run → suggest "run tests"
5. Research/analysis completed → suggest "implement the findings"
6. No strong signal → suggest "review what was done"

**Output:**
```json
{
  "prompt": "Run tests to verify the changes",
  "model": "sonnet",
  "confidence": 0.82,
  "reason": "Code was edited but tests haven't been run this session"
}
```

---

## Part 2: Model Recommendation

### Heuristic Baseline

| Task Type | Default Model |
|-----------|--------------|
| debugging, architecture, security-review | opus |
| implementation, refactoring, analysis | sonnet |
| quick-lookup, formatting, confirmation | haiku |

### Budget Pressure Adjustment

| Pressure Tier | Effect |
|---------------|--------|
| green | Use heuristic as-is |
| yellow | Downgrade opus → sonnet |
| red | Downgrade all to haiku (minimum cost) |

### Learning Store Adjustment (future)

If learning store has >10 records for a task_type+model combination:
- Success rate >85% → boost confidence
- Success rate <50% → try next model up

Not implemented in v1 — logged for future use.

---

## Part 3: Hook Integration

### PostToolUse — light hint

After the existing compaction + budget recording, add:

```js
import { quickHint } from '../../src/next-step-advisor.js';

const hint = quickHint(toolName, outputStr, brief);
// Append to additionalContext if non-empty
```

Only adds ~10 tokens per tool call.

### Stop hook — full recommendation

```js
import { fullRecommendation } from '../../src/next-step-advisor.js';

const records = store.readAll().slice(-50);
const budget = loadBudget(projectDir);
const rec = fullRecommendation(records, budget);

if (rec.prompt) {
  process.stderr.write(`\n── Teneb Suggestion ────────────────────────\n`);
  process.stderr.write(`  Next: ${rec.prompt}\n`);
  process.stderr.write(`  Model: ${rec.model} (confidence: ${(rec.confidence * 100).toFixed(0)}%)\n`);
  process.stderr.write(`  Why: ${rec.reason}\n`);
  process.stderr.write(`────────────────────────────────────────────\n\n`);
}
```

---

## Files

### New

| File | Purpose |
|------|---------|
| `src/next-step-advisor.js` | quickHint, fullRecommendation, recommendModel |
| `src/tests/next-step-advisor.test.js` | Unit tests for all rules |

### Modified

| File | Change |
|------|--------|
| `.claude/hooks/post-tool-use.js` | Add quickHint call, append to additionalContext |
| `.claude/hooks/stop.js` | Add fullRecommendation call, print suggestion |

---

## Error Handling

- No session records → return generic "review what was done" with low confidence
- Learning store read fails → skip learning adjustment, use heuristic only
- Budget file missing → assume green tier for model recommendation

---

## Testing

- `src/tests/next-step-advisor.test.js`:
  - quickHint returns correct hint for each tool+output pattern
  - quickHint returns empty string when no signal
  - fullRecommendation prioritizes correctly (tests failed > no tests > commit)
  - recommendModel returns correct model per task type
  - recommendModel downgrades at yellow/red pressure
- Existing tests unchanged
