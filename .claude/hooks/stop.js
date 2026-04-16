#!/usr/bin/env node
const input = await (async () => {
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return data ? JSON.parse(data) : {};
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
  process.stdout.write(JSON.stringify({
    continue: true,
    systemMessage: 'Teneb stop hook verified the response.'
  }, null, 2));
}
