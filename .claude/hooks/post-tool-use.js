#!/usr/bin/env node
import { LearningStore } from '../../src/learning-store.js';
import { ToolBroker } from '../../src/tool-broker.js';
import { compilePrompt } from '../../src/prompt-compiler.js';
import { microCompact } from '../../src/micro-compact.js';
import { loadProjectConfig } from '../../src/config.js';

const input = await (async () => {
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return data ? JSON.parse(data) : {};
})();

const projectDir = input.cwd || process.cwd();
const config = loadProjectConfig(projectDir);
const store = new LearningStore(config.learningFile);
const broker = new ToolBroker(store, config);
const toolName = input.tool_name || input.toolName || 'unknown';
const toolOutput = input.tool_output || input.output || input.result || '';
const toolInput = input.tool_input || input.toolInput || {};
const brief = compilePrompt(JSON.stringify(toolInput) + '\n' + String(toolOutput));
const compacted = microCompact(toolOutput, { maxLength: 220, aliasMinLength: config.compaction.aliasMinLength });

store.recordRun({
  tool_name: toolName,
  task_type: brief.task_type,
  success: true,
  tokens_saved: Math.max(0, Math.ceil(String(toolOutput).length / 4) - compacted.stats.after_tokens),
  pattern: 'post-tool-compaction'
});

process.stdout.write(JSON.stringify({
  decision: 'continue',
  hookSpecificOutput: {
    hookEventName: 'PostToolUse',
    additionalContext: [
      `Teneb compressed tool output from ~${compacted.stats.before_tokens} to ~${compacted.stats.after_tokens} tokens.`,
      `Key summary: ${compacted.compacted}`
    ].join('\n'),
    updatedMCPToolOutput: compacted.compacted
  }
}, null, 2));
