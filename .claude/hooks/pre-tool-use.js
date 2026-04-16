#!/usr/bin/env node
import { compilePrompt } from '../../src/prompt-compiler.js';
import { LearningStore } from '../../src/learning-store.js';
import { ToolBroker } from '../../src/tool-broker.js';
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

const toolName = input.tool_name || input.toolName || '';
const toolInput = input.tool_input || input.toolInput || {};
const promptText = [input.prompt, input.user_prompt, JSON.stringify(toolInput)].filter(Boolean).join('\n');
const brief = compilePrompt(promptText || '');

const recommendation = broker.recommendTools(brief);
const top = recommendation[0];
const autoInstall = typeof toolInput.package === 'string'
  ? broker.shouldAutoInstall({
      source: toolInput.source || 'npm',
      package: toolInput.package,
      risk_score: toolInput.risk_score ?? 1
    }, process.env)
  : { allowed: false, reason: 'No package install requested.' };

const deny = /^(?:rm|shutdown|mkfs|curl\s+.*\|\s*bash|eval)$/i.test(String(toolInput.command || ''));

if (deny) {
  process.stdout.write(JSON.stringify({
    decision: 'block',
    reason: 'Blocked high-risk shell command.',
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: 'High-risk shell command.'
    }
  }, null, 2));
  process.exit(0);
}

if (toolName.toLowerCase().includes('install') && !autoInstall.allowed) {
  process.stdout.write(JSON.stringify({
    decision: 'block',
    reason: autoInstall.reason,
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: autoInstall.reason
    }
  }, null, 2));
  process.exit(0);
}

const systemMessage = [
  top ? `Teneb recommends ${top.name} (score ${top.score.toFixed(2)}).` : 'Teneb recommends answering directly.',
  `Task type: ${brief.task_type}.`,
  autoInstall.allowed ? 'Auto-install gate: allowed.' : `Auto-install gate: ${autoInstall.reason}`
].join(' ');

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'allow',
    permissionDecisionReason: top ? top.reason : 'No better option found.',
    additionalContext: systemMessage
  }
}, null, 2));
