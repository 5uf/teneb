import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_THRESHOLDS = { yellow: 0.4, red: 0.8 };
const BUDGET_FILE = 'session-budget.json';
const TENEB_DIR = '.teneb';

/**
 * Calculate pressure tier and ratio from estimated tokens vs max budget.
 * @param {number} estimated - Current estimated token usage
 * @param {number} max - Maximum token budget
 * @param {{ yellow?: number, red?: number }} [thresholds] - Custom tier boundaries
 * @returns {{ tier: 'green'|'yellow'|'red', ratio: number }}
 */
export function getPressure(estimated, max, thresholds) {
  const t = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const ratio = max > 0 ? estimated / max : 0;
  let tier = 'green';
  if (ratio >= t.red) tier = 'red';
  else if (ratio >= t.yellow) tier = 'yellow';
  return { tier, ratio };
}

/**
 * Resolve the budget file path for a project directory.
 */
function budgetPath(projectDir) {
  return path.join(projectDir, TENEB_DIR, BUDGET_FILE);
}

/**
 * Atomically write JSON data to the budget file (write .tmp then rename).
 */
function atomicWrite(filePath, data) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

/**
 * Read budget data from disk. Returns null if missing or corrupt.
 */
function readBudgetFile(projectDir) {
  try {
    const raw = fs.readFileSync(budgetPath(projectDir), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Create/reset the session budget file.
 * @param {string} projectDir - Project root directory
 * @param {string} sessionId - Session identifier
 * @param {number} [maxBudget=200000] - Maximum token budget
 * @returns {object} The budget data written to disk
 */
export function resetBudget(projectDir, sessionId, maxBudget = 200000) {
  const data = {
    session_id: sessionId,
    started_at: new Date().toISOString(),
    estimated_tokens: 0,
    tool_calls: 0,
    prompts_blocked: 0,
    max_budget: maxBudget,
  };
  atomicWrite(budgetPath(projectDir), data);
  return data;
}

/**
 * Load the current budget, enriched with pressure info.
 * Fails open: if file is missing or corrupt, returns safe green defaults.
 * @param {string} projectDir - Project root directory
 * @param {{ yellow?: number, red?: number }} [thresholds] - Custom tier boundaries
 * @returns {object} Budget data with `pressure` field added
 */
export function loadBudget(projectDir, thresholds) {
  const data = readBudgetFile(projectDir);
  if (!data) {
    return {
      session_id: null,
      started_at: null,
      estimated_tokens: 0,
      tool_calls: 0,
      prompts_blocked: 0,
      max_budget: 200000,
      pressure: getPressure(0, 200000, thresholds),
    };
  }
  return {
    ...data,
    pressure: getPressure(data.estimated_tokens, data.max_budget, thresholds),
  };
}

/**
 * Atomically increment estimated_tokens by count and tool_calls by 1.
 * @param {string} projectDir - Project root directory
 * @param {number} count - Number of tokens to add
 */
export function recordTokens(projectDir, count) {
  const filePath = budgetPath(projectDir);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  data.estimated_tokens += count;
  data.tool_calls += 1;
  atomicWrite(filePath, data);
}

/**
 * Atomically increment prompts_blocked by 1.
 * @param {string} projectDir - Project root directory
 */
export function recordBlocked(projectDir) {
  const filePath = budgetPath(projectDir);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  data.prompts_blocked += 1;
  atomicWrite(filePath, data);
}

/**
 * Return the max output line count for a given pressure tier.
 * @param {'green'|'yellow'|'red'} tier
 * @returns {number}
 */
export function maxLengthForTier(tier) {
  const map = { green: 220, yellow: 140, red: 80 };
  return map[tier] ?? 80;
}
