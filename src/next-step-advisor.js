// next-step-advisor.js — Auto-recommend next actions based on session context

const OPUS_TASKS = new Set(['debugging', 'architecture', 'security-review']);
const MODEL_RANK = ['haiku', 'sonnet', 'opus'];

/**
 * Recommend which model to use for a given task type and budget pressure.
 * @param {string} taskType - e.g. debugging, implementation, architecture, etc.
 * @param {string} budget   - 'green' | 'yellow' | 'red'
 * @returns {'haiku'|'sonnet'|'opus'}
 */
export function recommendModel(taskType, budget) {
  // Base heuristic: opus for heavy tasks, sonnet for everything else
  const base = OPUS_TASKS.has(taskType) ? 'opus' : 'sonnet';

  if (budget === 'red') return 'haiku';

  if (budget === 'yellow') {
    // Downgrade one step, but never below sonnet
    const idx = MODEL_RANK.indexOf(base);
    return MODEL_RANK[Math.max(1, idx - 1)];
  }

  // green — use heuristic as-is
  return base;
}

// ── quickHint patterns ──────────────────────────────────────────────────────

const TEST_FAIL_RE = /FAIL|fail [1-9]|\u2717/;          // FAIL, fail N (N>0), ✗
const TEST_PASS_RE = /pass \d+[\s\S]*fail 0|\u2714/;      // pass N ... fail 0 (multiline), ✔
const BUILD_ERROR_RE = /error TS|Build failed|SyntaxError/;
const COMMIT_RE = /\[\S+ [0-9a-f]+\]/;                   // [branch hash]

/**
 * Return a single-line hint based on the most recent tool invocation.
 * @param {string} toolName
 * @param {string} toolOutput
 * @param {string} promptBrief
 * @returns {string} hint or empty string
 */
export function quickHint(toolName, toolOutput, promptBrief) {
  // Edit/Write of non-docs file → run tests
  if (toolName === 'Edit' || toolName === 'Write') {
    return 'Teneb hint: run tests';
  }

  if (toolName === 'Bash') {
    // Order matters: test failure before test pass (fail pattern is more urgent)
    if (TEST_FAIL_RE.test(toolOutput))  return 'Teneb hint: fix failing test';
    if (TEST_PASS_RE.test(toolOutput))  return 'Teneb hint: commit changes';
    if (BUILD_ERROR_RE.test(toolOutput)) return 'Teneb hint: fix build error';
    if (COMMIT_RE.test(toolOutput))     return 'Teneb hint: push or open PR';
  }

  return '';
}

// ── fullRecommendation ──────────────────────────────────────────────────────

/**
 * Analyse a list of session records and recommend the next action.
 * @param {Array<{tool:string, output:string, type:string}>} sessionRecords
 * @param {string} budget - 'green' | 'yellow' | 'red'
 * @returns {{prompt:string, model:string, confidence:number, reason:string}}
 */
export function fullRecommendation(sessionRecords, budget) {
  if (!sessionRecords || sessionRecords.length === 0) {
    return {
      prompt: 'Review project state',
      model: recommendModel('general', budget),
      confidence: 0.3,
      reason: 'No session records to analyse'
    };
  }

  const hasFailures = sessionRecords.some(
    (r) => TEST_FAIL_RE.test(r.output || '') || BUILD_ERROR_RE.test(r.output || '')
  );
  const hasEdits = sessionRecords.some((r) => r.type === 'edit');
  const hasTestPass = sessionRecords.some((r) => TEST_PASS_RE.test(r.output || ''));
  const hasTestRun = sessionRecords.some((r) => r.type === 'test-run');
  const lastType = sessionRecords[sessionRecords.length - 1].type;

  // Priority 1: failures exist
  if (hasFailures) {
    return {
      prompt: 'Fix the failing tests or errors',
      model: recommendModel('debugging', budget),
      confidence: 0.85,
      reason: 'Detected test failures or build errors in session'
    };
  }

  // Priority 2: edits + tests passed
  if (hasEdits && hasTestPass) {
    return {
      prompt: 'Commit the changes',
      model: recommendModel('general', budget),
      confidence: 0.82,
      reason: 'Edits made and tests are passing'
    };
  }

  // Priority 3: edits but no test run
  if (hasEdits && !hasTestRun) {
    return {
      prompt: 'Run tests to verify',
      model: recommendModel('implementation', budget),
      confidence: 0.78,
      reason: 'Edits detected but no test run found'
    };
  }

  // Priority 4: last task was analysis
  if (lastType === 'analysis') {
    return {
      prompt: 'Implement the findings',
      model: recommendModel('implementation', budget),
      confidence: 0.6,
      reason: 'Analysis completed, ready for implementation'
    };
  }

  // Default
  return {
    prompt: 'Review what was done',
    model: recommendModel('general', budget),
    confidence: 0.4,
    reason: 'No strong signal for next step'
  };
}
