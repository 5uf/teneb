# Teneb: Progressive Token Budget System

**Date:** 2026-04-18
**Status:** Approved

---

## Problem

Teneb currently saves ~42% on tool output compression, but has no mechanism to:
- Block wasteful prompts before they consume 30K-60K tokens per API call
- Adapt compression aggressiveness based on cumulative context usage
- Apply tool-type-aware compression strategies

## Goals

1. Prevent wasted API calls via a pre-send prompt quality gate (typo auto-correct + ambiguity detection)
2. Compress tool outputs intelligently based on tool type (Read, Bash, Write/Edit)
3. Track cumulative token budget per session with progressive compression tiers
4. Coordinate all hooks via a shared pressure signal

## Out of Scope

- External spellcheck APIs or NLP libraries (zero deps — all heuristic-based)
- Modifying Claude Code internals or API interceptors
- Automatic prompt rewriting (only auto-correct known typos, block ambiguous — never rewrite intent)

---

## Part 1: Token Budget Controller

### File

`src/token-budget.js`

### State

Per-session file at `.teneb/session-budget.json`:

```json
{
  "session_id": "abc-123",
  "started_at": "2026-04-18T10:00:00.000Z",
  "estimated_tokens": 24300,
  "tool_calls": 8,
  "max_budget": 200000
}
```

### API

| Function | Purpose |
|----------|---------|
| `resetBudget(projectDir, sessionId, maxBudget)` | Create/reset budget file. Called by session-start. |
| `loadBudget(projectDir)` | Read current budget. Returns `{ estimated_tokens, tool_calls, pressure }`. |
| `recordTokens(projectDir, count)` | Atomically add `count` to running total. Increment `tool_calls`. |
| `getPressure(estimated, max)` | Returns `{ tier: 'green'|'yellow'|'red', ratio: float }`. |

### Pressure Tiers

| Tier | Token Ratio | Compaction maxLength | Prompt gate threshold |
|------|-------------|---------------------|----------------------|
| green | <40% | 220 | 3+ non-stopword tokens |
| yellow | 40–80% | 140 | 4+ non-stopword tokens |
| red | >80% | 80 | 5+ tokens AND must contain path/tool/code keyword |

`max_budget` defaults to 200,000 tokens (~20% of 1M context window, conservative estimate of usable space after system prompt and Claude Code overhead). Configurable in `config.js`.

---

## Part 2: Pre-send Prompt Quality Gate

### File

`src/prompt-guard.js` — pure functions, no side effects.

### Hook integration

`prompt-submit.js` calls the guard before forwarding to Claude.

### Check 1 — Typo auto-correct

Dictionary of ~50 common programming typos:
- `fucntion` → `function`, `reutrn` → `return`, `teh` → `the`, `wiht` → `with`, etc.
- Applied via word-boundary regex replace
- Applied silently — corrected prompt forwarded, original logged to learning store
- Only whole-word replacements (no partial match)

### Check 2 — Ambiguity detector

Block prompts too vague to be useful:

1. Fewer than N non-stopword tokens (N varies by tier: 3/4/5) AND no code/path references → block
2. No verb detected (checked against a small ~100 verb list covering programming tasks) → block
3. Pure gibberish: >40% of words not in a basic 3,000-word English set → block

**Exceptions (never blocked):**
- Single letters a–z (conversational replies like "b", "d", "y")
- "yes", "no", "ok", "continue", "stop", common confirmations
- Strings containing file paths (`/`, `.js`, `.py`, etc.)
- Strings containing code patterns (backticks, `()`, `{}`, `=>`)

### Check 3 — Pressure-aware tightening

At yellow/red pressure, the ambiguity threshold increases (see tier table in Part 1).

### When blocked

```json
{
  "decision": "block",
  "reason": "Prompt too vague — try adding what file or action you need. (Teneb saved ~40K tokens by catching this early.)"
}
```

The prompt never reaches Claude.

---

## Part 3: Smart Tool Output Compression

### Hook integration

`post-tool-use.js` applies tool-type-aware strategies before microCompact.

### Read outputs — selective extraction

For outputs >200 lines:
1. Extract first 5 lines (imports/headers)
2. Find lines matching keywords from the prompt brief (function names, variables, patterns)
3. Include matched lines with ±3 lines context (±1 at red pressure)
4. Include last 2 lines
5. Replace omitted sections with `[…N lines omitted]`
6. Then run through microCompact as usual

For outputs ≤200 lines: current microCompact pipeline (no change).

### Bash outputs — pattern-based trimming

| Pattern | Action |
|---------|--------|
| npm/pnpm install success | Keep last 3 lines |
| Test runner output | Keep summary + failure details only |
| git status/diff | Keep summary, strip object hashes |
| Build output | Keep errors/warnings + final status |
| Other | Standard microCompact |

Detection: regex on first few lines to identify output type.

### Write/Edit confirmations

- `"File created successfully at..."` → `"ok:<filename>"`
- `"The file has been updated successfully..."` → `"ok:<filename>"`

Saves ~4 tokens per Write/Edit — compounds across many edits in a session.

### Pressure-adjusted limits

| Tier | Read maxLines | Bash maxLines | Confirmations |
|------|-------------|--------------|---------------|
| green | 80 | 40 | shortened |
| yellow | 40 | 20 | "ok" |
| red | 20 | 10 | "ok" |

---

## Part 4: Progressive Integration

### Session lifecycle

```
session-start.js
  └─ resetBudget(projectDir, sessionId, 200000)

prompt-submit.js (each user message)
  ├─ loadBudget() → get pressure tier
  ├─ typo auto-correct (always on)
  ├─ ambiguity check (threshold varies by tier)
  ├─ recordTokens(estimatedPromptTokens)
  └─ if blocked → { decision: 'block' }, no API call happens

pre-tool-use.js (each tool call)
  ├─ loadBudget() → get pressure tier
  ├─ at red tier → inject additionalContext: "Context budget critical. Be concise."
  └─ existing tool recommendation + safety gate logic (unchanged)

post-tool-use.js (each tool result)
  ├─ loadBudget() → get pressure tier
  ├─ smart compression (tool-type-aware, tier-adjusted maxLength)
  ├─ recordTokens(rawOutputTokens - tokensSaved)
  └─ record compact_ms, tier, tokens_saved to learning store

session-end.js
  └─ enhanced summary: tier reached, budget used, prompts blocked, tokens saved
```

### Config additions

Added to `config.js` defaults:

```js
budget: {
  max_tokens: 200000,
  green_threshold: 0.4,
  yellow_threshold: 0.8
}
```

Overridable via `.teneb/config.json`.

---

## Files

### New files

| File | Purpose |
|------|---------|
| `src/token-budget.js` | Budget state: load, record, reset, getPressure |
| `src/prompt-guard.js` | Typo dictionary, ambiguity detector, verb list |

### Modified files

| File | Change |
|------|--------|
| `.claude/hooks/prompt-submit.js` | Add quality gate (typo + ambiguity + pressure check) |
| `.claude/hooks/post-tool-use.js` | Add tool-type-aware compression + budget tracking |
| `.claude/hooks/pre-tool-use.js` | Inject "be concise" at red pressure |
| `.claude/hooks/session-start.js` | Reset budget on session start |
| `.claude/hooks/session-end.js` | Enhanced summary with budget stats |
| `src/config.js` | Add budget threshold defaults |

---

## Error Handling

- Budget file missing/corrupt → treated as green tier (fail open, not closed)
- Budget file write race → use atomic write (write to temp + rename)
- Typo dictionary miss → no correction (never guess)
- Ambiguity false positive → user gets clear message with what to add; can rephrase and retry immediately

---

## Testing

- `src/tests/token-budget.test.js` — unit tests for all tiers, edge cases (0%, 40%, 80%, 100%)
- `src/tests/prompt-guard.test.js` — typo correction, ambiguity detection, exception whitelist
- Existing 56 tests unchanged (no core module modifications)
- Manual: run Claude Code session, verify budget file updates, verify session-end summary shows budget stats
- Manual: send ambiguous prompt at red pressure, verify block
