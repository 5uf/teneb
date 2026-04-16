export const FIXTURES = [
  {
    id: 'research-dup',
    prompt: 'Research the Claude Code hook system, explain hooks, MCP prompts, and context windows. Be concise and avoid repeating the same point twice.',
    content: [
      'Claude Code hooks can run before and after tool calls.',
      'Claude Code hooks can run before and after tool calls.',
      'MCP prompts become slash commands.',
      'The context window is finite and should be compressed.',
      'The context window is finite and should be compressed.',
      'Provide a brief, structured answer.'
    ].join(' ')
  },
  {
    id: 'implementation-tools',
    prompt: 'Implement a plugin that compacts context, scores tools, and auto-installs dependencies only when safe. Please use Read, Edit, Bash, and maybe a search tool.',
    content: [
      'We need Read, Edit, Bash, and WebSearch.',
      'We need Read, Edit, Bash, and WebSearch.',
      'Auto-install should be denied unless allowlisted and sandboxed.',
      'Use a learning store to persist mistakes and tool reliability.',
      'Use a learning store to persist mistakes and tool reliability.'
    ].join(' ')
  },
  {
    id: 'debug-failure-loop',
    prompt: 'Debug a repeated failure loop where the model keeps calling the wrong tool and re-emitting the same output.',
    content: [
      'The agent called the wrong tool twice.',
      'The agent called the wrong tool twice.',
      'The output repeated the same sentence.',
      'The learning system should record the failure fingerprint.',
      'The learning system should record the failure fingerprint.'
    ].join(' ')
  }
];
