# Teneb

[![npm version](https://img.shields.io/npm/v/teneb-claude-code.svg)](https://www.npmjs.com/package/teneb-claude-code)
[![Tests](https://github.com/5uf/teneb/actions/workflows/test.yml/badge.svg)](https://github.com/5uf/teneb/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)]()

A Claude Code plugin that reduces token usage by compressing tool outputs, blocking wasteful prompts, and managing your context budget automatically.

## What it does

Teneb hooks into Claude Code's lifecycle and works silently in the background:

- **Compresses tool outputs** — Read, Bash, Edit results are compacted before re-entering Claude's context window. ~42% average token reduction.
- **Diff-aware re-reads** — When Claude reads the same file twice, Teneb replaces the second read with a unified diff or "unchanged" marker. Saves 80–95% on repeat reads.
- **MCP compression** — Schema-aware JSON compression for `mcp__*` tools (Figma, Serena, Playwright, etc.) that return huge payloads: truncates arrays, drops empty fields, caps nested depth.
- **Smart file picker** — Before Read/Glob/Grep, Teneb scans the repo and hints at the most relevant files based on your prompt keywords.
- **Fixes typos** — Auto-corrects 50 common programming typos (e.g. `fucntion` → `function`) silently.
- **Manages context budget** — Tracks token usage across your session with three pressure tiers (green/yellow/red). Compression gets more aggressive as you approach the context limit.
- **Suggests next steps** — After each tool call and at session end, recommends what to do next and which model to use.
- **Prompt templates** — `teneb prompt debug|review|refactor|...` prints proven prompt structures you can pipe into Claude.
- **Learns across sessions** — Records tool reliability, success rates, and patterns to improve recommendations over time.
- **Rust/WASM engine** — Optional native compaction engine for faster processing.

## Install

Pick whichever you prefer.

**One-line curl:**
```bash
cd your-project
curl -fsSL https://raw.githubusercontent.com/5uf/teneb/main/install.sh | bash
```

**npm (global):**
```bash
npm i -g teneb-claude-code
cd your-project
teneb init
```

**Manual (clone the repo):**
```bash
git clone https://github.com/5uf/teneb.git
cd your-project
node /path/to/teneb/src/cli.js init
```

**As a Claude Code plugin (system-wide, all projects):**

Point Claude Code at the cloned repo via its plugin system. The repo includes a `hooks.json` manifest using `$CLAUDE_PLUGIN_ROOT` so one install activates Teneb across every project. No per-project copying needed.

Any of these will copy hooks + runtime into your project's `.claude/hooks/` and `src/`, and write `.claude/settings.json`. Restart Claude Code in that directory and Teneb is active.

Run `teneb doctor` to check the install.

### Optional: Build the WASM engine

For faster compaction, compile the Rust engine:

```bash
rustup target add wasm32-unknown-unknown
cd rust-wasm
cargo build --target wasm32-unknown-unknown --release
```

Teneb auto-detects the WASM binary and uses it. Falls back to JavaScript if not compiled.

## How it works

Teneb uses [Claude Code hooks](https://docs.anthropic.com/en/docs/claude-code/hooks) to intercept key events:

| Hook | What Teneb does |
|------|----------------|
| **SessionStart** | Resets the token budget for the new session |
| **PromptSubmit** | Fixes typos, tracks token usage |
| **PreToolUse** | Recommends tools, blocks risky commands, suggests relevant files for Read/Glob/Grep, injects conciseness hints at high pressure |
| **PostToolUse** | Diff-aware Read cache, MCP JSON compression, smart truncation, microCompact, budget tracking, next-step hint |
| **Stop** | Suggests what to do next and which model to use |
| **SessionEnd** | Prints session summary (tokens saved, tools used, budget status) |

### Token budget tiers

| Tier | Context used | What changes |
|------|-------------|-------------|
| Green | < 40% | Normal compaction |
| Yellow | 40–80% | Tighter compression (maxLength 140), "prefer short answers" hint injected |
| Red | > 80% | Aggressive compression (maxLength 80), "be concise" hint injected |

## Benchmarking

### Offline comparison

```bash
npm run ab
```

Compares raw token counts vs Teneb-compacted output on built-in fixtures:

```
source                        type      raw_tok teneb_tok  reduction  engine
────────────────────────────────────────────────────────────────────────────
research-dup                  fixture        73        45      38.4%  rust-wasm
implementation-tools          fixture        68        38      44.1%  rust-wasm
debug-failure-loop            fixture        59        32      45.8%  rust-wasm
────────────────────────────────────────────────────────────────────────────
AVERAGE                                      67        38      42.5%
```

### Live A/B comparison

Runs the same prompt through Claude Code with and without hooks:

```bash
npm run live-ab                          # 3 runs, default prompt
npm run live-ab -- --runs 5              # more runs for statistical confidence
npm run live-ab -- --prompt-set code     # test code-related prompts
npm run live-ab -- --prompt-set all      # all prompt categories
npm run live-ab -- --prompt "your prompt here"
```

Results saved to `benchmarks/results/`.

### Capture real data

Record raw tool outputs from real Claude Code sessions for replay:

```bash
TENEB_CAPTURE=1 claude    # captures raw outputs to benchmarks/captures/
npm run ab                # replays them alongside synthetic fixtures
```

## Scripts

| Command | What it does |
|---------|-------------|
| `npm test` | Run all tests (162 tests across 35 suites) |
| `npm run ab` | Offline A/B token comparison |
| `npm run live-ab` | Live Claude Code A/B benchmark |
| `npm run benchmark` | Full benchmark suite |
| `npm run report` | Generate benchmark dashboard |
| `teneb prompt <name>` | Print a proven prompt template |
| `teneb prompt --list` | List available templates |
| `teneb doctor` | Check installation health |

## Prompt templates

```bash
teneb prompt debug      # structured debugging workflow
teneb prompt review     # severity-rated code review
teneb prompt refactor   # behavior-preserving refactor guide
teneb prompt write-test # TDD test-writing guide
teneb prompt commit     # commit-message review
teneb prompt explain    # concise code explanation
```

Pipe into Claude:
```bash
teneb prompt debug | claude -p -
```

## Configuration

Teneb uses sensible defaults. Override via `.teneb/config.json`:

```json
{
  "compaction": {
    "maxSummaryLength": 240,
    "aliasMinLength": 16
  },
  "budget": {
    "max_tokens": 200000,
    "green_threshold": 0.4,
    "yellow_threshold": 0.8
  }
}
```

## Project structure

```
src/
  micro-compact.js        # Text compaction (filler removal, alias tables)
  semantic-deduper.js     # Near-duplicate sentence removal
  token-budget.js         # Per-session budget tracking
  prompt-guard.js         # Typo correction (ambiguity check available, disabled by default)
  next-step-advisor.js    # Next action + model recommendations
  read-cache.js           # Diff-aware Read cache (replace re-reads with diffs)
  mcp-compactor.js        # JSON compression for MCP tool outputs
  file-picker.js          # Keyword-ranked file suggestions for Read/Glob/Grep
  prompts/templates.js    # Built-in prompt templates (debug, review, refactor, ...)
  tool-broker.js          # Tool scoring + auto-install gate
  predictive-planner.js   # Predictive execution planning
  learning-store.js       # Cross-session JSONL learning store
  wasm-bridge.js          # Rust/WASM engine loader
  config.js               # Configuration defaults + merging
  index.d.ts              # Public TypeScript declarations
  tests/                  # 162 tests across 35 suites

.claude/hooks/            # Claude Code hook entry points
rust-wasm/                # Rust compaction engine (no_std, 51KB WASM)
benchmarks/               # Benchmark results + captured data
```

## License

MIT
