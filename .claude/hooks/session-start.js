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
const fp = store.getFingerprint('general', []);

process.stdout.write(`Teneb session started. Fingerprint: ${JSON.stringify(fp)}\n`);
