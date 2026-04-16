import { normalizeText, semanticSimilarity, splitSentences, unique } from './utils.js';

const STOPWORDS = new Set([
  'the','and','or','a','an','to','of','in','for','on','with','by','is','are','was','were',
  'be','been','this','that','it','as','at','from','into','we','you','they','i','our','your',
  'can','could','should','would','may','might','will','just','very','more','most','not'
]);

function keywords(text) {
  return normalizeText(text)
    .split(' ')
    .map((w) => w.trim())
    .filter((w) => w && !STOPWORDS.has(w))
    .slice(0, 80);
}

export function dedupeSentences(text, threshold = 0.84) {
  const sentences = splitSentences(text);
  const kept = [];
  for (const sentence of sentences) {
    const normalized = normalizeText(sentence);
    const isDuplicate = kept.some((existing) => semanticSimilarity(existing, normalized) >= threshold);
    if (!isDuplicate) kept.push(sentence.trim());
  }
  return kept.join(' ');
}

export function dedupeFacts(items = [], threshold = 0.84) {
  const kept = [];
  for (const item of items) {
    const candidate = typeof item === 'string' ? item : JSON.stringify(item);
    const isDuplicate = kept.some((existing) => semanticSimilarity(existing.key, candidate) >= threshold);
    if (!isDuplicate) kept.push({ key: candidate, value: item });
  }
  return kept.map((entry) => entry.value);
}

export function semanticDeduplicate(textOrItems, options = {}) {
  const threshold = options.threshold ?? 0.84;
  if (Array.isArray(textOrItems)) return dedupeFacts(textOrItems, threshold);
  return dedupeSentences(String(textOrItems || ''), threshold);
}

export function buildDedupIndex(text) {
  const sentences = splitSentences(text);
  const indexed = [];
  for (const sentence of sentences) {
    indexed.push({
      sentence,
      normalized: normalizeText(sentence),
      keywords: keywords(sentence)
    });
  }
  return indexed;
}

export function findRedundantClusters(text, threshold = 0.82) {
  const indexed = buildDedupIndex(text);
  const clusters = [];
  const visited = new Set();

  for (let i = 0; i < indexed.length; i++) {
    if (visited.has(i)) continue;
    const group = [indexed[i]];
    visited.add(i);
    for (let j = i + 1; j < indexed.length; j++) {
      if (visited.has(j)) continue;
      const score = semanticSimilarity(indexed[i].normalized, indexed[j].normalized);
      if (score >= threshold) {
        group.push(indexed[j]);
        visited.add(j);
      }
    }
    if (group.length > 1) clusters.push(group);
  }
  return clusters;
}

export function dedupeTextBlocks(blocks, threshold = 0.84) {
  const out = [];
  const seen = [];
  for (const block of blocks) {
    const txt = typeof block === 'string' ? block : block?.text || JSON.stringify(block);
    const normalized = normalizeText(txt);
    const dup = seen.some((s) => semanticSimilarity(s, normalized) >= threshold);
    if (!dup) {
      seen.push(normalized);
      out.push(block);
    }
  }
  return out;
}
