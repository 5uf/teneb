import { approxTokenCount, extractPhrases, normalizeText, splitSentences, stableHash } from './utils.js';
import { dedupeSentences } from './semantic-deduper.js';

function aliasTable(phrases) {
  const table = new Map();
  let i = 1;
  for (const phrase of phrases) {
    table.set(phrase, `⟦C${i++}⟧`);
  }
  return table;
}

function replaceAliases(text, table) {
  let out = text;
  const entries = [...table.entries()].sort((a, b) => b[0].length - a[0].length);
  for (const [phrase, alias] of entries) {
    const rx = new RegExp(escapeRegex(phrase), 'gi');
    out = out.replace(rx, alias);
  }
  return out;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function compactCodeLike(text) {
  return text
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\b(function|const|let|var)\b/g, (m) => ({ function: 'fn', const: 'const', let: 'let', var: 'var' }[m] || m))
    .trim();
}

function compressSentences(text, maxLength) {
  const sentences = splitSentences(text);
  if (sentences.length <= 2) return text.slice(0, maxLength);
  const first = sentences.slice(0, 2).join(' ');
  const last = sentences.slice(-1)[0];
  const middleSignals = sentences
    .slice(2, -1)
    .map((s) => s.match(/\b([A-Za-z][A-Za-z0-9_/-]{4,})\b/g)?.slice(0, 4) || [])
    .flat();
  const signals = [...new Set(middleSignals)].slice(0, 6);
  const preview = [first, signals.length ? `signals: ${signals.join(', ')}` : '', last]
    .filter(Boolean)
    .join(' ');
  return preview.slice(0, maxLength);
}

export function microCompact(input, options = {}) {
  const maxLength = options.maxLength ?? 280;
  const text = typeof input === 'string' ? input : JSON.stringify(input, null, 2);
  const normalized = normalizeText(text);
  const phrases = extractPhrases(text).filter((p) => p.length >= (options.aliasMinLength ?? 16));
  const selected = phrases.slice(0, 16);
  const table = aliasTable(selected);

  let compacted = text;
  compacted = dedupeSentences(compacted, options.duplicateSimilarityThreshold ?? 0.84);
  compacted = replaceAliases(compacted, table);
  compacted = compacted.replace(/\b(really|very|actually|basically|literally|simply|just)\b/gi, '');
  compacted = compacted.replace(/\s+/g, ' ').trim();

  if (compacted.length > maxLength) {
    compacted = compressSentences(compacted, maxLength);
  }

  if (compacted.length > maxLength) {
    compacted = compactCodeLike(compacted).slice(0, maxLength);
  }

  const stats = {
    before_tokens: approxTokenCount(text),
    after_tokens: approxTokenCount(compacted),
    reduction_ratio: text.length ? 1 - compacted.length / text.length : 0,
    signature: stableHash(compacted)
  };

  return {
    original: text,
    compacted,
    alias_map: Object.fromEntries(table.entries()),
    stats
  };
}

export function compactContextPack(pack, options = {}) {
  const asText = [
    `goal: ${pack.goal || ''}`,
    `resolved: ${(pack.resolved || []).join('; ')}`,
    `open: ${(pack.open_questions || []).join('; ')}`,
    `facts: ${(pack.key_facts || []).join('; ')}`,
    `next: ${pack.next_step || ''}`,
    `tools: ${(pack.recommended_tools || []).map((t) => t.name).join(', ')}`
  ].join('\n');
  return microCompact(asText, options);
}
