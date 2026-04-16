#!/usr/bin/env node
import { LearningStore } from '../../src/learning-store.js';
import { loadProjectConfig } from '../../src/config.js';

const input = await (async () => {
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return data ? JSON.parse(data) : {};
})();

const projectDir = input.cwd || process.cwd();
const config = loadProjectConfig(projectDir);
const store = new LearningStore(config.learningFile);

store.recordRun({
  session_id: input.session_id || input.sessionId || 'unknown',
  task_type: input.task_type || 'general',
  success: true,
  tokens_saved: Number(input.tokens_saved || 0),
  pattern: 'session-end'
});

process.stdout.write('Teneb session stored.\n');
