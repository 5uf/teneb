#!/usr/bin/env node
import { LearningStore } from '../../src/learning-store.js';
import { compactContextPack } from '../../src/micro-compact.js';
import { loadProjectConfig } from '../../src/config.js';

const input = await (async () => {
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return data ? JSON.parse(data) : {};
})();

const projectDir = input.cwd || process.cwd();
const config = loadProjectConfig(projectDir);
const store = new LearningStore(config.learningFile);

const latest = store.getFingerprint('general', []);
const contextPack = compactContextPack({
  goal: input.goal || 'compaction',
  resolved: ['Preserve recent task state'],
  open_questions: latest.patterns.slice(0, 3),
  key_facts: [
    `attempts=${latest.attempts}`,
    `success_rate=${(latest.success_rate * 100).toFixed(1)}%`
  ],
  next_step: 'Continue with compacted memory only',
  recommended_tools: []
}, { maxLength: 180, aliasMinLength: config.compaction.aliasMinLength });

process.stdout.write(JSON.stringify({
  decision: 'continue',
  hookSpecificOutput: {
    hookEventName: 'PreCompact',
    additionalContext: `Context pack before compaction:\n${JSON.stringify(contextPack, null, 2)}`
  }
}, null, 2));
