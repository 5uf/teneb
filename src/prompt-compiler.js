import { approxTokenCount, normalizeText, splitSentences } from './utils.js';

const taskKeywords = [
  { type: 'analysis', words: ['research', 'analyze', 'compare', 'benchmark', 'evaluate', 'audit'] },
  { type: 'implementation', words: ['build', 'implement', 'create', 'generate', 'scaffold', 'wire'] },
  { type: 'debugging', words: ['fix', 'debug', 'error', 'fail', 'broken', 'bug'] },
  { type: 'refactor', words: ['refactor', 'simplify', 'reduce', 'optimize', 'compact'] }
];

function inferTaskType(prompt) {
  const text = normalizeText(prompt);
  for (const bucket of taskKeywords) {
    if (bucket.words.some((word) => text.includes(word))) return bucket.type;
  }
  return 'general';
}

export function compilePrompt(input, config = {}) {
  const prompt = typeof input === 'string' ? input : input?.prompt || '';
  const taskType = inferTaskType(prompt);
  const text = normalizeText(prompt);
  const sentences = splitSentences(prompt);
  const wantsShort = /\b(short|brief|concise|minimal|low verbosity)\b/i.test(prompt);
  const wantsDeep = /\b(detail|deep|thorough|research|full)\b/i.test(prompt);

  const constraints = {
    verbosity: wantsShort ? 'low' : wantsDeep ? 'high' : 'medium',
    cost: /\bcheap|minimize|token efficient|efficient\b/i.test(prompt) ? 'minimize' : 'balanced',
    latency: /\bfast|instant|blink|low latency\b/i.test(prompt) ? 'fast' : 'balanced'
  };

  const allowedTools = [];
  if (/\b(code|implement|edit|fix|refactor)\b/i.test(prompt)) allowedTools.push('Read', 'Edit', 'Write');
  if (/\b(search|research|latest|find)\b/i.test(prompt)) allowedTools.push('WebSearch', 'WebFetch');
  if (/\b(repo|git|github)\b/i.test(prompt)) allowedTools.push('Bash', 'mcp__github');
  if (/\b(memory|remember|history|session)\b/i.test(prompt)) allowedTools.push('session-memory');

  const forbiddenTools = [];
  if (/\bno install|do not install|never install\b/i.test(prompt)) forbiddenTools.push('install');
  if (/\bunsafe|malware|exfiltrate\b/i.test(prompt)) forbiddenTools.push('*');

  return {
    prompt,
    task_type: taskType,
    normalized: text,
    signals: {
      sentence_count: sentences.length,
      estimated_tokens: approxTokenCount(prompt),
      wants_short: wantsShort,
      wants_deep: wantsDeep
    },
    constraints,
    allowed_tools: [...new Set(allowedTools)],
    forbidden_tools: [...new Set(forbiddenTools)],
    output_format: /\bjson\b/i.test(prompt) ? 'json' : 'markdown',
    confidence_target: taskType === 'debugging' ? 0.9 : taskType === 'analysis' ? 0.85 : 0.8,
    source: input
  };
}
