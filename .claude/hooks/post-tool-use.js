#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { LearningStore } from '../../src/learning-store.js';
import { ToolBroker } from '../../src/tool-broker.js';
import { compilePrompt } from '../../src/prompt-compiler.js';
import { microCompact } from '../../src/micro-compact.js';
import { loadProjectConfig } from '../../src/config.js';
import { loadBudget, recordTokens, maxLengthForTier } from '../../src/token-budget.js';
import { quickHint } from '../../src/next-step-advisor.js';
import { processReadOutput } from '../../src/read-cache.js';
import { compactMcpOutput } from '../../src/mcp-compactor.js';

function smartTruncate(output, toolName, tier) {
  const lines = output.split('\n');
  const maxLines = tier === 'red' ? 20 : tier === 'yellow' ? 40 : 80;

  if (['Write', 'Edit'].includes(toolName) && /(?:success|updated|created)/i.test(output)) {
    const fname = output.match(/(?:\/[\w.-]+)+/)?.[0]?.split('/').pop() || '';
    return fname ? `ok:${fname}` : 'ok';
  }

  if (lines.length <= maxLines) return output;

  if (toolName === 'Bash') {
    return '[...' + (lines.length - maxLines) + ' lines omitted]\n' + lines.slice(-maxLines).join('\n');
  }

  const header = lines.slice(0, 5);
  const tail = lines.slice(-2);
  const middle = lines.slice(5, -2);
  const kept = middle.slice(0, maxLines - 7);
  const omitted = middle.length - kept.length;
  if (omitted > 0) {
    return [...header, ...kept, `[...${omitted} lines omitted]`, ...tail].join('\n');
  }
  return output;
}

const input = await (async () => {
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  try { return data ? JSON.parse(data) : {}; }
  catch { process.stdout.write(JSON.stringify({ decision: 'continue' })); process.exit(0); }
})();

const projectDir = input.cwd || process.cwd();
const config = loadProjectConfig(projectDir);
const store = new LearningStore(config.learningFile);
const broker = new ToolBroker(store, config);
const toolName = input.tool_name || input.toolName || 'unknown';
const toolOutput = input.tool_output || input.output || input.result || '';
const toolInput = input.tool_input || input.toolInput || {};
const brief = compilePrompt(JSON.stringify(toolInput) + '\n' + String(toolOutput));
const outputStr = String(toolOutput || '');

// Diff-aware Read: replace re-read output with unified diff or "unchanged" marker.
let processedOutput = outputStr;
if (toolName === 'Read') {
  const filePath = toolInput.file_path || toolInput.filePath || toolInput.path;
  if (filePath) {
    const result = processReadOutput(projectDir, filePath, outputStr);
    processedOutput = result.output;
  }
}

// MCP tools: apply schema-aware JSON compression
processedOutput = compactMcpOutput(toolName, processedOutput);

const budget = loadBudget(projectDir, { green: config.budget?.green_threshold, yellow: config.budget?.yellow_threshold });
const tierMaxLength = maxLengthForTier(budget.pressure.tier);

const truncated = smartTruncate(processedOutput, toolName, budget.pressure.tier);
const t0 = performance.now();
const compacted = microCompact(truncated, { maxLength: tierMaxLength, aliasMinLength: config.compaction.aliasMinLength });
const compact_ms = Math.round(performance.now() - t0);

// Capture mode: save raw output to benchmarks/captures/ for A/B benchmarking.
// Enable with: TENEB_CAPTURE=1 claude
if (process.env.TENEB_CAPTURE === '1') {
  const captureDir = path.join(projectDir, 'benchmarks', 'captures');
  fs.mkdirSync(captureDir, { recursive: true });
  fs.writeFileSync(
    path.join(captureDir, `${Date.now()}-${toolName}.json`),
    JSON.stringify({ tool_name: toolName, raw_output: outputStr, captured_at: new Date().toISOString() }, null, 2)
  );
}

const isFailure = /\b(error|exception|traceback|ENOENT|EACCES|EPERM|not found|command not found|failed|fatal)\b/i.test(outputStr);

store.recordRun({
  tool_name: toolName,
  task_type: brief.task_type,
  success: !isFailure,
  failure_mode: isFailure ? 'error-in-output' : undefined,
  tokens_saved: Math.max(0, Math.ceil(outputStr.length / 4) - compacted.stats.after_tokens),
  compact_ms,
  tier: budget.pressure.tier,
  pattern: 'post-tool-compaction'
});

recordTokens(projectDir, compacted.stats.after_tokens);

const hint = quickHint(toolName, outputStr, brief);

process.stdout.write(JSON.stringify({
  decision: 'continue',
  hookSpecificOutput: {
    hookEventName: 'PostToolUse',
    additionalContext: [
      `Teneb compressed tool output from ~${compacted.stats.before_tokens} to ~${compacted.stats.after_tokens} tokens.`,
      `Key summary: ${compacted.compacted}`,
      ...(hint ? [hint] : [])
    ].join('\n'),
    updatedMCPToolOutput: compacted.compacted
  }
}, null, 2));
