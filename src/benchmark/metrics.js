import { approxTokenCount } from '../utils.js';

export function summarizeBenchmark(before, after, extras = {}) {
  const beforeTokens = approxTokenCount(before);
  const afterTokens = approxTokenCount(after);
  const reduction = beforeTokens ? (beforeTokens - afterTokens) / beforeTokens : 0;
  return {
    before_tokens: beforeTokens,
    after_tokens: afterTokens,
    token_reduction_ratio: Number(reduction.toFixed(4)),
    ...extras
  };
}

export function computeAverages(results) {
  const total = results.length || 1;
  const sum = results.reduce((acc, row) => {
    acc.before_tokens += row.before_tokens || 0;
    acc.after_tokens += row.after_tokens || 0;
    acc.token_reduction_ratio += row.token_reduction_ratio || 0;
    acc.tool_recall_accuracy += row.tool_recall_accuracy || 0;
    acc.reliability_gain += row.reliability_gain || 0;
    return acc;
  }, { before_tokens: 0, after_tokens: 0, token_reduction_ratio: 0, tool_recall_accuracy: 0, reliability_gain: 0 });

  return {
    before_tokens: Number((sum.before_tokens / total).toFixed(2)),
    after_tokens: Number((sum.after_tokens / total).toFixed(2)),
    token_reduction_ratio: Number((sum.token_reduction_ratio / total).toFixed(4)),
    tool_recall_accuracy: Number((sum.tool_recall_accuracy / total).toFixed(4)),
    reliability_gain: Number((sum.reliability_gain / total).toFixed(4))
  };
}
