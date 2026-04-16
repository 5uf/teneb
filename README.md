# Teneb Claude Code v5

Teneb is a Claude Code control plane that adds:

- stronger micro-compaction
- semantic deduplication
- predictive execution
- tool reliability scoring
- cross-session learning
- an aggressive auto-install gate
- a Rust/WASM compaction engine
- benchmark + dashboard tooling
- Claude-native hook wiring

## What is included

- `src/` — the runtime, planners, deduper, compactor, learning store, verifier, and benchmark runner
- `.claude/hooks/` — Claude Code hook entrypoints
- `rust-wasm/` — a real Rust WASM compaction engine source tree
- `benchmarks/fixtures/` — benchmark scenarios
- `dashboard/` — generated HTML benchmark dashboard

## Run

```bash
node src/cli.js demo
node src/benchmark/benchmark.js
node src/benchmark/dashboard.js
```

## Claude Code setup

1. Copy `.claude/settings.example.json` to `.claude/settings.json`
2. Ensure the hook scripts are executable:
   ```bash
   chmod +x .claude/hooks/*.js
   ```
3. Point Claude Code at this repository.

The hooks emit structured JSON and context packs based on the Claude Code hook contract. Claude Code supports hook events such as `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PreCompact`, `SessionStart`, `SessionEnd`, and `Stop`, and MCP tools/prompts can be matched through the `mcp__<server>__<tool>` naming pattern. The hook reference also documents JSON control fields such as `continue`, `stopReason`, `suppressOutput`, and `systemMessage`. The MCP docs note that prompts can appear as slash commands. See the official Claude Code docs for details. 

## Rust/WASM engine

The Rust source lives in `rust-wasm/`. It implements:
- semantic deduplication over text segments
- compact context summaries
- graph-aware compaction signals

If your environment has Rust and the `wasm32-unknown-unknown` target, you can compile it into a WASM artifact and wire it through `src/wasm-bridge.js`.

## Benchmark suite

The benchmark runner compares a naive baseline to the Teneb pipeline using:
- token estimate reduction
- redundancy removal
- tool-call reduction
- predicted next-tool accuracy
- compaction ratio

Outputs are written to `benchmarks/results/latest.json` and rendered into `dashboard/report.html`.

## Auto-install policy

The auto-install gate is intentionally strict:
- deny by default
- allow only with explicit opt-in
- require allowlisted sources
- require sandboxed or isolated execution

This is designed to be safer than a blanket install flow.
# teneb
