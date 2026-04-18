/**
 * Categorized test prompts for live A/B benchmarking.
 * Each prompt forces at least one tool call so PostToolUse fires.
 */

export const PROMPT_SETS = {
  code: [
    {
      id: 'read-explain-jaccard',
      label: 'Read + explain function',
      prompt: 'Read src/utils.js and in exactly one sentence tell me what the jaccard function does.'
    },
    {
      id: 'read-count-exports',
      label: 'Read + count exports',
      prompt: 'Read src/tool-broker.js and count how many exported symbols (functions, classes, constants) it has. Just give the number.'
    }
  ],
  debug: [
    {
      id: 'find-bitwise',
      label: 'Find code pattern',
      prompt: 'Read src/utils.js and tell me if any function uses the bitwise XOR operator (^). Answer with yes or no and the line number if yes.'
    },
    {
      id: 'rust-panic-handler',
      label: 'Locate Rust panic handler',
      prompt: 'Read rust-wasm/src/lib.rs and tell me on which line the panic_handler function is defined. Just give the line number.'
    }
  ],
  shell: [
    {
      id: 'count-test-files',
      label: 'List + count test files',
      prompt: 'Run this command: ls src/tests/ — then tell me how many .test.js files exist. Just give the number.'
    },
    {
      id: 'wasm-binary-size',
      label: 'Check WASM binary size',
      prompt: 'Run: ls -lh rust-wasm/target/wasm32-unknown-unknown/release/teneb_wasm.wasm 2>/dev/null || echo "not compiled" — then tell me the file size in one word.'
    }
  ],
  research: [
    {
      id: 'no-tool-concept',
      label: 'Conceptual (no tools)',
      prompt: 'What is FNV-1a hashing? Answer in exactly two sentences without using any tools.'
    }
  ]
};

export const ALL_PROMPTS = Object.entries(PROMPT_SETS).flatMap(([category, prompts]) =>
  prompts.map((p) => ({ ...p, category }))
);

export function resolvePromptSet(name, customPrompt) {
  if (customPrompt) {
    return [{ id: 'custom', label: 'Custom', category: 'custom', prompt: customPrompt }];
  }
  if (!name || name === 'all') return ALL_PROMPTS;
  const set = PROMPT_SETS[name];
  if (!set) {
    const valid = Object.keys(PROMPT_SETS).join(', ');
    throw new Error(`Unknown prompt set "${name}". Valid sets: ${valid}, all`);
  }
  return set.map((p) => ({ ...p, category: name }));
}
