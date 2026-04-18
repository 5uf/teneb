#!/usr/bin/env node
import './shared.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { compilePrompt } from '../../src/prompt-compiler.js';
import { semanticDeduplicate } from '../../src/semantic-deduper.js';
import { compactContextPack } from '../../src/micro-compact.js';
import { loadBudget, recordTokens, recordBlocked } from '../../src/token-budget.js';
import { autoCorrectTypos, checkAmbiguity } from '../../src/prompt-guard.js';
import { loadProjectConfig } from '../../src/config.js';
import { LearningStore } from '../../src/learning-store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(__dirname, '../..');
const config = loadProjectConfig(projectDir);
const store = new LearningStore(config.learningFile);

const input = await (async () => {
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return data ? JSON.parse(data) : {};
})();

const prompt = input.prompt || input.text || '';
const brief = compilePrompt(prompt);
const prior = input.conversation || input.history || [];
const compactedHistory = semanticDeduplicate(prior.map((x) => typeof x === 'string' ? x : JSON.stringify(x))).slice(0, 1200);
const contextPack = compactContextPack({
  goal: brief.prompt,
  resolved: ['Prompt compiled'],
  open_questions: [],
  key_facts: [
    `task_type=${brief.task_type}`,
    `verbosity=${brief.constraints.verbosity}`,
    `cost=${brief.constraints.cost}`,
    `latency=${brief.constraints.latency}`
  ],
  next_step: 'Run the predictive planner and tool broker',
  recommended_tools: []
}, { maxLength: 220 });

// Quality gate
const rawPrompt = input.prompt || input.user_prompt || '';
const budget = loadBudget(projectDir, {
  green: config.budget?.green_threshold,
  yellow: config.budget?.yellow_threshold
});

// Auto-correct typos
const corrected = autoCorrectTypos(rawPrompt);
if (corrected !== rawPrompt) {
  store.recordRun({ type: 'typo-correction', original: rawPrompt.slice(0, 100), corrected: corrected.slice(0, 100), pattern: 'prompt-guard' });
}

// Ambiguity check disabled — allow short/conversational prompts.
// Typo correction above still runs; budget tracking below still runs.

// Record estimated tokens to budget
recordTokens(projectDir, Math.ceil(corrected.length / 4));

process.stdout.write([
  'TENEB_PROMPT_BRIEF',
  JSON.stringify(brief, null, 2),
  '',
  'TENEB_CONTEXT_PACK',
  JSON.stringify(contextPack, null, 2),
  '',
  compactedHistory ? `TENEB_HISTORY\n${compactedHistory}` : ''
].filter(Boolean).join('\n'));
