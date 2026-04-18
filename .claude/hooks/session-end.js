#!/usr/bin/env node
import { LearningStore } from '../../src/learning-store.js';
import { loadProjectConfig } from '../../src/config.js';
import { loadBudget } from '../../src/token-budget.js';

const input = await (async () => {
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  try { return data ? JSON.parse(data) : {}; }
  catch { return {}; }
})();

const projectDir = input.cwd || process.cwd();
const config = loadProjectConfig(projectDir);
const store = new LearningStore(config.learningFile);

store.recordRun({
  session_id: input.session_id || input.sessionId || 'unknown',
  task_type: 'general',
  success: true,
  pattern: 'session-end'
});

// Build session summary from recent tool-compaction records
const stats = store.getRecentStats(200);

const lines = ['── Teneb Session Summary ──────────────────'];

if (stats.tool_calls === 0) {
  lines.push('  No tool calls compacted this session.');
} else {
  lines.push(`  Tool calls processed : ${stats.tool_calls}`);
  lines.push(`  Success rate         : ${(stats.success_rate * 100).toFixed(0)}%`);
  lines.push(`  Tokens saved (est.)  : ${stats.tokens_saved.toLocaleString()}`);
  if (stats.avg_compact_ms > 0) {
    lines.push(`  Avg compaction time  : ${stats.avg_compact_ms}ms`);
  }
  if (stats.top_tools.length) {
    lines.push(`  Top tools            : ${stats.top_tools.join(', ')}`);
  }
}

const budget = loadBudget(projectDir);
if (budget.max_budget > 0) {
  const usedPct = ((budget.estimated_tokens / budget.max_budget) * 100).toFixed(0);
  lines.push(`  Token budget used    : ${budget.estimated_tokens.toLocaleString()} / ${budget.max_budget.toLocaleString()} (${usedPct}%)`);
  lines.push(`  Peak pressure tier   : ${budget.pressure.tier}`);
  if (budget.prompts_blocked > 0) {
    lines.push(`  Prompts blocked      : ${budget.prompts_blocked} (saved ~${(budget.prompts_blocked * 40000).toLocaleString()} tokens)`);
  }
}

lines.push('───────────────────────────────────────────');

process.stderr.write(lines.join('\n') + '\n');
