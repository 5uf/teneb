#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compilePrompt } from './prompt-compiler.js';
import { semanticDeduplicate, findRedundantClusters } from './semantic-deduper.js';
import { microCompact, compactContextPack } from './micro-compact.js';
import { buildSemanticGraph, compactSemanticGraph, semanticGraphToContext } from './semantic-graph.js';
import { loadProjectConfig } from './config.js';
import { LearningStore } from './learning-store.js';
import { ToolBroker, DEFAULT_TOOLS } from './tool-broker.js';
import { PredictiveExecutionPlanner } from './predictive-planner.js';
import { verifyOutput } from './verifier.js';
import { getTemplate, listTemplates } from './prompts/templates.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(__dirname, '..');
const config = loadProjectConfig(projectDir);
const store = new LearningStore(config.learningFile);
const broker = new ToolBroker(store, config);
const planner = new PredictiveExecutionPlanner(broker, store);

function readStdin() {
  return new Promise((resolve) => {
    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (input += chunk));
    process.stdin.on('end', () => resolve(input));
    if (process.stdin.isTTY) resolve('');
  });
}

async function cmdDemo() {
  const prompt = 'Research the best Claude Code plugin architecture, dedupe repeated points, keep it concise, and suggest tools.';
  const brief = compilePrompt(prompt, config);
  const compacted = microCompact(prompt, { maxLength: 220, aliasMinLength: config.compaction.aliasMinLength });
  const deduped = semanticDeduplicate([
    'Claude Code supports hooks.',
    'Claude Code supports hooks.',
    'MCP prompts become slash commands.'
  ]);
  const graph = compactSemanticGraph(buildSemanticGraph(prompt), { maxNodes: 10 });
  const recommendations = broker.recommendTools(brief, DEFAULT_TOOLS);
  const prediction = planner.plan(brief, {
    open_questions: ['Need hook wiring?', 'Need benchmark suite?'],
    key_facts: ['Reduce tokens', 'Keep output short']
  }, DEFAULT_TOOLS);
  const output = {
    brief,
    compacted,
    deduped,
    graph: semanticGraphToContext(graph),
    recommendations,
    prediction,
    verifier: verifyOutput(compacted.compacted, { maxTokens: 80 })
  };
  console.log(JSON.stringify(output, null, 2));
}

async function cmdDoctor() {
  const checks = [
    { name: 'node', ok: Number(process.versions.node.split('.')[0]) >= 20 },
    { name: 'learning-store', ok: fs.existsSync(config.learningFile) },
    { name: 'hooks-directory', ok: fs.existsSync(path.join(projectDir, '.claude', 'hooks')) }
  ];
  console.log(JSON.stringify({ ok: checks.every((c) => c.ok), checks }, null, 2));
  process.exit(checks.every((c) => c.ok) ? 0 : 1);
}

async function cmdCompact() {
  const input = await readStdin();
  const compacted = microCompact(input, { maxLength: 280, aliasMinLength: config.compaction.aliasMinLength });
  process.stdout.write(JSON.stringify(compacted, null, 2));
}

async function cmdPlan() {
  const input = await readStdin();
  const brief = compilePrompt(input || '');
  const plan = planner.plan(brief, {}, DEFAULT_TOOLS);
  process.stdout.write(JSON.stringify(plan, null, 2));
}

async function cmdPrompt() {
  const [,,, name] = process.argv;
  if (!name || name === '--list') {
    console.log('Available templates:');
    for (const t of listTemplates()) console.log('  ' + t);
    return;
  }
  const body = getTemplate(name);
  if (!body) {
    console.error(`Unknown template: ${name}`);
    console.error('Available: ' + listTemplates().join(', '));
    process.exit(1);
  }
  console.log(body);
}

async function cmdInit() {
  const target = process.cwd();
  const pkgRoot = path.resolve(__dirname, '..');

  if (target === pkgRoot) {
    console.error('teneb init: refusing to run inside the package itself. cd into your project first.');
    process.exit(1);
  }

  const copyDir = (src, dest) => {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const s = path.join(src, entry.name);
      const d = path.join(dest, entry.name);
      if (entry.isDirectory()) copyDir(s, d);
      else fs.copyFileSync(s, d);
    }
  };

  const steps = [];

  // Copy hooks
  const hooksSrc = path.join(pkgRoot, '.claude', 'hooks');
  const hooksDst = path.join(target, '.claude', 'hooks');
  copyDir(hooksSrc, hooksDst);
  for (const f of fs.readdirSync(hooksDst)) {
    if (f.endsWith('.js') || f.endsWith('.mjs')) fs.chmodSync(path.join(hooksDst, f), 0o755);
  }
  steps.push(`copied ${fs.readdirSync(hooksDst).length} hook files → .claude/hooks/`);

  // Copy src
  const srcDst = path.join(target, 'src');
  if (fs.existsSync(srcDst)) {
    steps.push('src/ already exists — skipped (remove it first for a clean install)');
  } else {
    copyDir(path.join(pkgRoot, 'src'), srcDst);
    steps.push('copied src/ runtime');
  }

  // Copy settings.json
  const settingsSrc = path.join(pkgRoot, '.claude', 'settings.example.json');
  const settingsDst = path.join(target, '.claude', 'settings.json');
  if (fs.existsSync(settingsDst)) {
    steps.push('.claude/settings.json already exists — skipped');
  } else if (fs.existsSync(settingsSrc)) {
    fs.copyFileSync(settingsSrc, settingsDst);
    steps.push('wrote .claude/settings.json');
  }

  // Optional: copy rust-wasm if present
  const wasmSrc = path.join(pkgRoot, 'rust-wasm');
  const wasmDst = path.join(target, 'rust-wasm');
  if (fs.existsSync(wasmSrc) && !fs.existsSync(wasmDst)) {
    copyDir(wasmSrc, wasmDst);
    steps.push('copied rust-wasm/ (run `cargo build --target wasm32-unknown-unknown --release` to compile)');
  }

  console.log('Teneb installed:');
  for (const s of steps) console.log(`  • ${s}`);
  console.log('\nRestart Claude Code in this directory to activate hooks.');
}

async function main() {
  const [,, command] = process.argv;
  switch (command) {
    case 'init':
      await cmdInit(); break;
    case 'demo':
      await cmdDemo(); break;
    case 'doctor':
      await cmdDoctor(); break;
    case 'compact':
      await cmdCompact(); break;
    case 'plan':
      await cmdPlan(); break;
    case 'prompt':
      await cmdPrompt(); break;
    default:
      console.log(`Teneb CLI

Usage:
  teneb init              # install hooks into the current project
  teneb doctor            # check installation health
  teneb demo              # show pipeline output
  cat prompt.txt | teneb compact
  cat prompt.txt | teneb plan
  teneb prompt <name>     # print a prompt template (debug, review, refactor, ...)
  teneb prompt --list     # list available templates
`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
