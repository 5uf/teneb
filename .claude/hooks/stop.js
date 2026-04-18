#!/usr/bin/env node
import { LearningStore } from '../../src/learning-store.js';
import { loadProjectConfig } from '../../src/config.js';
import { loadBudget } from '../../src/token-budget.js';
import { fullRecommendation } from '../../src/next-step-advisor.js';

const input = await (async () => {
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  try { return data ? JSON.parse(data) : {}; }
  catch { return {}; }
})();

const text = String(input.final_text || input.output || input.result || '');

if (text.length > 1800) {
  process.stdout.write(JSON.stringify({
    decision: 'block',
    reason: 'Teneb stop hook rejected an overlong response; compress and retry.',
    hookSpecificOutput: {
      hookEventName: 'Stop',
      additionalContext: 'Response should be shorter and more focused.'
    }
  }, null, 2));
} else {
  const projectDir = input.cwd || process.cwd();
  const config = loadProjectConfig(projectDir);
  const store = new LearningStore(config.learningFile);
  const budget = loadBudget(projectDir, {
    green: config.budget?.green_threshold,
    yellow: config.budget?.yellow_threshold
  });
  const records = store.readAll().slice(-50);
  const rec = fullRecommendation(records, budget);

  if (rec.prompt) {
    process.stderr.write([
      '',
      '── Teneb Suggestion ────────────────────────',
      `  Next: ${rec.prompt}`,
      `  Model: ${rec.model} (confidence: ${(rec.confidence * 100).toFixed(0)}%)`,
      `  Why: ${rec.reason}`,
      '────────────────────────────────────────────',
      ''
    ].join('\n'));
  }

  process.stdout.write(JSON.stringify({
    continue: true,
    systemMessage: 'Teneb stop hook verified the response.'
  }, null, 2));
}
