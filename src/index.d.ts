// Public type definitions for teneb-claude-code

export interface PressureInfo {
  tier: 'green' | 'yellow' | 'red';
  ratio: number;
}

export interface Budget {
  session_id: string;
  started_at: string;
  estimated_tokens: number;
  tool_calls: number;
  prompts_blocked: number;
  max_budget: number;
  pressure: PressureInfo;
}

// token-budget
export function getPressure(estimated: number, max: number, thresholds?: { green?: number; yellow?: number }): PressureInfo;
export function resetBudget(projectDir: string, sessionId: string, maxBudget?: number): void;
export function loadBudget(projectDir: string, thresholds?: { green?: number; yellow?: number }): Budget;
export function recordTokens(projectDir: string, count: number): void;
export function recordBlocked(projectDir: string): void;
export function maxLengthForTier(tier: 'green' | 'yellow' | 'red'): number;

// prompt-guard
export function autoCorrectTypos(text: string): string;
export function checkAmbiguity(text: string, tier?: 'green' | 'yellow' | 'red'): { blocked: boolean; reason?: string };

// micro-compact
export interface CompactResult {
  compacted: string;
  alias_map: Record<string, string>;
  stats: { before_tokens: number; after_tokens: number; reduction_ratio: number; signature: string };
}
export function microCompact(text: string, options?: { maxLength?: number; aliasMinLength?: number }): CompactResult;

// next-step-advisor
export type Model = 'haiku' | 'sonnet' | 'opus';
export interface Recommendation {
  prompt: string;
  model: Model;
  confidence: number;
  reason: string;
}
export function recommendModel(taskType: string, budget: { pressure: PressureInfo }): Model;
export function quickHint(toolName: string, toolOutput: string, promptBrief: { task_type: string }): string;
export function fullRecommendation(sessionRecords: Array<Record<string, any>>, budget: { pressure: PressureInfo }): Recommendation;
