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

async function main() {
  const [,, command] = process.argv;
  switch (command) {
    case 'demo':
      await cmdDemo(); break;
    case 'doctor':
      await cmdDoctor(); break;
    case 'compact':
      await cmdCompact(); break;
    case 'plan':
      await cmdPlan(); break;
    default:
      console.log(`Teneb CLI

Usage:
  teneb demo
  teneb doctor
  cat prompt.txt | teneb compact
  cat prompt.txt | teneb plan
`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
