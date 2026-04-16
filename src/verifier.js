import { approxTokenCount, splitSentences } from './utils.js';

export function verifyOutput(text, options = {}) {
  const maxTokens = options.maxTokens ?? 220;
  const sentences = splitSentences(text);
  const issues = [];

  if (!text || !String(text).trim()) issues.push('empty_output');
  if (approxTokenCount(text) > maxTokens) issues.push('too_verbose');
  if (sentences.length > 1) {
    const first = sentences[0];
    const repeated = sentences.slice(1).some((s) => s.toLowerCase() === first.toLowerCase());
    if (repeated) issues.push('repeated_sentence');
  }

  const jsonLike = /^[\s\n\r]*[{[]/.test(String(text));
  if (options.expectedFormat === 'json' && !jsonLike) issues.push('not_json_like');

  const grammarScore = Math.max(0.55, 1 - issues.length * 0.12);
  return {
    ok: issues.length === 0,
    issues,
    grammar_score: Number(grammarScore.toFixed(2)),
    token_estimate: approxTokenCount(text)
  };
}

export function reviseResponse(text, summary) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return summary;
  const maxLen = summary?.maxLength ?? 1200;
  if (trimmed.length <= maxLen) return trimmed;
  return trimmed.slice(0, maxLen).replace(/\s+\S*$/, '') + '…';
}
