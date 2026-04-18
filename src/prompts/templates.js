export const TEMPLATES = {
  debug: `Debug this issue step by step:
1. Identify the failing behavior and quote the exact error
2. Form 2-3 competing hypotheses for root cause
3. For each, list evidence for/against
4. Pick the most likely, verify with targeted test
5. Fix the root cause (not the symptom) and add a regression test`,

  review: `Review this code for:
- Logic errors and edge cases
- Security issues (injection, auth, secrets)
- Performance problems (n+1, unbounded loops)
- Test coverage gaps
- Naming clarity
Flag severity as CRITICAL, HIGH, MEDIUM, LOW. Suggest specific fixes.`,

  refactor: `Refactor this code:
1. Identify the core responsibility
2. Extract unrelated concerns into separate functions/modules
3. Replace magic numbers with named constants
4. Simplify nested conditionals (early returns, guard clauses)
5. Ensure existing tests still pass
Preserve behavior exactly. Report before/after line counts.`,

  'write-test': `Write tests for this code following TDD:
1. Happy path
2. Edge cases (empty, null, boundary values)
3. Error conditions
4. Integration with other modules
Use node:test + node:assert/strict. Each test name describes behavior.`,

  commit: `Review uncommitted changes and write a commit message:
- Lead with a one-line summary in imperative mood
- If complex, add a body explaining WHY not WHAT
- Reference any relevant issue or ticket
- Group related files; split unrelated changes into separate commits`,

  explain: `Explain this code to someone unfamiliar with the codebase:
- What does it do in one sentence?
- Why does it exist? (business or technical motivation)
- What are the key decisions/trade-offs?
- How does it interact with surrounding code?
Keep it under 200 words.`
};

export function listTemplates() {
  return Object.keys(TEMPLATES);
}

export function getTemplate(name) {
  return TEMPLATES[name] ?? null;
}
