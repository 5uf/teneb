# Teneb: Installation + A/B Performance Benchmark

**Date:** 2026-04-18
**Status:** Approved

---

## Problem

Teneb's compaction pipeline (micro-compact, semantic dedup, WASM) reduces token usage on Claude Code tool outputs. There is no way to: (a) install it into the live Claude Code session, or (b) measure the actual token reduction in a controlled with/without comparison.

---

## Goals

1. Install Teneb hooks into the current Claude Code project so they run on every real tool call.
2. Add a passive capture mode that records raw tool outputs from real sessions.
3. Add an A/B comparison script that runs both "no Teneb" and "full Teneb" pipelines on the same inputs and reports the delta.

---

## What Is Out of Scope

- Hook latency measurement (approach C, rejected)
- Real Claude API session orchestration (requires API key + multi-session runner)
- Quality/semantic evaluation of compacted output (subjective, deferred)

---

## Part 1: Installation

### Mechanism

Claude Code supports project-level hook configuration via `.claude/settings.json`. The repo already includes `.claude/settings.example.json` with the correct hook format. Installation = copy that file into place.

The hooks reference `$CLAUDE_PROJECT_DIR`, which Claude Code sets automatically to the project root at runtime. No path changes required.

The user's global `~/.claude/settings.json` already has hooks from other tools. Project-level settings run in addition — Teneb hooks are scoped to this project only.

### Steps

1. Copy `.claude/settings.example.json` → `.claude/settings.json`
2. Make all hook scripts executable: `chmod +x .claude/hooks/*.js`
3. Commit `.claude/settings.json` — contains no sensitive data (only `$CLAUDE_PROJECT_DIR` env var references), so hooks activate automatically for anyone who opens the project

### Hooks installed

| Event | Hook file | Purpose |
|-------|-----------|---------|
| `UserPromptSubmit` | `prompt-submit.js` | Compile prompt brief, seed context pack |
| `PreToolUse` | `pre-tool-use.js` | Predict next tool, log to learning store |
| `PostToolUse` | `post-tool-use.js` | Compact tool output, record run result |
| `PreCompact` | `pre-compact.js` | Compress context before Claude's compaction |
| `SessionStart` | `session-start.js` | Load session state |
| `SessionEnd` | `session-end.js` | Persist session state |
| `Stop` | `stop.js` | Final flush |

---

## Part 2: Capture Mode

### Mechanism

`post-tool-use.js` checks `process.env.TENEB_CAPTURE`. When set to `'1'`, it writes the raw (pre-compaction) tool output to `benchmarks/captures/<timestamp>-<toolName>.json` before any processing occurs.

### Capture record schema

```json
{
  "tool_name": "Read",
  "raw_output": "... full tool output ...",
  "captured_at": "2026-04-18T10:00:00.000Z"
}
```

### Usage

```bash
TENEB_CAPTURE=1 claude        # enable capture
claude                         # normal mode (no capture, zero overhead)
```

`benchmarks/captures/` is gitignored — real session data is local only.

---

## Part 3: A/B Comparison Script

### File

`src/benchmark/ab-compare.js`

### Inputs

1. **Synthetic fixtures** — all 3 entries from `src/benchmark/fixtures.js` (always available, repeatable)
2. **Real captures** — all `*.json` files in `benchmarks/captures/` (skipped gracefully if empty; script prints capture instructions)

### Pipelines

| Pipeline | What it does |
|----------|-------------|
| **Baseline** | Raw token count only (`Math.ceil(text.length / 4)`). No processing. Represents Claude Code without Teneb. |
| **Teneb** | `semanticDeduplicate` → `microCompact(maxLength: 220)` → WASM if compiled, JS-fallback otherwise. |

### Output

Console table, one row per input:

```
source                    type     raw_tok  teneb_tok  reduction  engine
─────────────────────────────────────────────────────────────────────────
debug-dup                 fixture      412         89     78.4%   rust-wasm
research-dup              fixture      388         92     76.3%   rust-wasm
implementation-tools      fixture      356         87     75.6%   rust-wasm
1713400000-Read.json      capture      201         67     66.7%   rust-wasm
─────────────────────────────────────────────────────────────────────────
AVERAGE                                339         84     74.2%
```

If no captures exist, prints:
```
No real captures found. Run: TENEB_CAPTURE=1 claude
```

### npm script

```json
"ab": "node ./src/benchmark/ab-compare.js"
```

---

## Data Flow

```
Real Claude session
  └─ post-tool-use.js
       ├─ [TENEB_CAPTURE=1] → benchmarks/captures/<ts>-<tool>.json
       └─ compacted output → Claude context window

npm run ab
  ├─ fixtures.js (synthetic)
  ├─ benchmarks/captures/*.json (real, if any)
  └─ ab-compare.js
       ├─ Baseline pipeline → raw token count
       ├─ Teneb pipeline → compacted token count
       └─ console table + summary
```

---

## Error Handling

- `benchmarks/captures/` missing → script creates it and prints capture instructions
- Captures with unparseable JSON → skipped with a warning, not fatal
- WASM binary missing → falls back to JS pipeline silently (engine column shows `js-fallback`)

---

## Testing

- Existing 56 tests continue to pass (no changes to core modules)
- `ab-compare.js` tested manually: run `npm run ab`, verify table renders, verify fixture rows match `npm run benchmark` token counts within rounding
- Capture mode tested by running `TENEB_CAPTURE=1 node -e "..."` and confirming file written to `benchmarks/captures/`
