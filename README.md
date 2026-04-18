# Teneb

[![npm version](https://img.shields.io/npm/v/teneb-claude-code.svg)](https://www.npmjs.com/package/teneb-claude-code)
[![Tests](https://github.com/5uf/teneb/actions/workflows/test.yml/badge.svg)](https://github.com/5uf/teneb/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)]()

**Save tokens in Claude Code.** Teneb is a plugin that compresses tool output, skips duplicate work, and keeps your context window clean — automatically.

~42% fewer tokens on a typical tool call. No config needed.

---

## Install

Pick one:

```bash
# curl
curl -fsSL https://raw.githubusercontent.com/5uf/teneb/main/install.sh | bash

# npm
npm i -g teneb-claude-code && teneb init

# clone
git clone https://github.com/5uf/teneb.git && node teneb/src/cli.js init
```

Run inside your project directory. Restart Claude Code. Done.

Check it worked: `teneb doctor`

---

## What it does

Teneb plugs into Claude Code's hooks and silently:

- **Compresses tool output** before it re-enters Claude's context (~42% smaller)
- **Replaces re-reads with diffs** — read the same file twice? Teneb sends only what changed
- **Shrinks MCP payloads** — huge JSON from Figma/Serena/Playwright gets trimmed
- **Suggests relevant files** before Claude runs Read/Glob/Grep
- **Fixes common typos** (`fucntion` → `function`)
- **Tracks your token budget** — compression gets tighter as you approach the limit
- **Recommends next steps** — after each task, suggests what to do and which model to use

All of this runs locally, with no external services.

---

## Scripts

```bash
npm test                # 162 tests
npm run ab              # show compression % on sample fixtures
npm run live-ab         # real A/B test through Claude Code
teneb prompt debug      # print a proven debug prompt
teneb prompt --list     # list all templates
teneb doctor            # check install
```

**Prompt templates available:** `debug`, `review`, `refactor`, `write-test`, `commit`, `explain`

---

## How the budget works

Teneb tracks how much of your context window is used. As you approach the limit, it compresses more aggressively.

| Used   | Mode    | What happens |
|--------|---------|--------------|
| <40%   | green   | Normal compression |
| 40–80% | yellow  | Tighter compression, short-answer hints |
| >80%   | red     | Maximum compression, "be concise" injected |

---

## Configuration (optional)

Default settings are sensible. Override via `.teneb/config.json`:

```json
{
  "budget": {
    "max_tokens": 200000,
    "green_threshold": 0.4,
    "yellow_threshold": 0.8
  },
  "compaction": {
    "maxSummaryLength": 240
  }
}
```

---

## Faster compression (optional)

For best performance, build the Rust/WASM engine:

```bash
rustup target add wasm32-unknown-unknown
cd rust-wasm && cargo build --target wasm32-unknown-unknown --release
```

Teneb uses it automatically if present. Falls back to JavaScript otherwise.

---

## License

MIT
