#!/usr/bin/env node
import './shared.mjs';
import { compilePrompt } from '../../src/prompt-compiler.js';
import { semanticDeduplicate } from '../../src/semantic-deduper.js';
import { compactContextPack } from '../../src/micro-compact.js';

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

process.stdout.write([
  'TENEB_PROMPT_BRIEF',
  JSON.stringify(brief, null, 2),
  '',
  'TENEB_CONTEXT_PACK',
  JSON.stringify(contextPack, null, 2),
  '',
  compactedHistory ? `TENEB_HISTORY\n${compactedHistory}` : ''
].filter(Boolean).join('\n'));
