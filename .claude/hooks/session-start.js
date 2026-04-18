#!/usr/bin/env node
import { LearningStore } from '../../src/learning-store.js';
import { loadProjectConfig } from '../../src/config.js';
import { resetBudget } from '../../src/token-budget.js';

const input = await (async () => {
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return data ? JSON.parse(data) : {};
})();

const projectDir = input.cwd || process.cwd();
const config = loadProjectConfig(projectDir);
const store = new LearningStore(config.learningFile);
const sessionId = input.session_id || input.sessionId || `sess-${Date.now()}`;
const budgetMax = config.budget?.max_tokens ?? 200000;
resetBudget(projectDir, sessionId, budgetMax);
const fp = store.getFingerprint('general', []);

process.stdout.write(`Teneb session started. Fingerprint: ${JSON.stringify(fp)}\n`);
