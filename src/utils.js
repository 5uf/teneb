export function approxTokenCount(text) {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

export function stableHash(input) {
  const data = typeof input === 'string' ? input : JSON.stringify(input);
  let h = 2166136261;
  for (let i = 0; i < data.length; i++) {
    h ^= data.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function nowIso() {
  return new Date().toISOString();
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function unique(array) {
  return [...new Set(array)];
}

export function normalizeText(text) {
  return (text || "")
    .toLowerCase()
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/https?:\/\/\S+/g, " URL ")
    .replace(/[^a-z0-9._/\\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function splitSentences(text) {
  const cleaned = (text || "").trim();
  if (!cleaned) return [];
  return cleaned
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function extractPhrases(text) {
  const normalized = normalizeText(text);
  const phrases = [];
  const regexes = [
    /[a-z][a-z0-9._/-]{6,}/g,
    /\b[a-z]+[A-Z][a-zA-Z0-9]+/g,
    /\b[A-Z][A-Za-z0-9]{5,}\b/g
  ];
  for (const rx of regexes) {
    const matches = normalized.match(rx);
    if (matches) phrases.push(...matches);
  }
  return unique(phrases).slice(0, 50);
}

export function jaccard(a, b) {
  const setA = new Set(a);
  const setB = new Set(b);
  if (!setA.size && !setB.size) return 1;
  const inter = [...setA].filter((x) => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size;
  return union ? inter / union : 0;
}

export function ngrams(text, n = 3) {
  const s = normalizeText(text).replace(/\s+/g, " ");
  const grams = [];
  for (let i = 0; i <= s.length - n; i++) grams.push(s.slice(i, i + n));
  return grams;
}

export function semanticSimilarity(a, b) {
  const sa = new Set(ngrams(a));
  const sb = new Set(ngrams(b));
  return jaccard(sa, sb);
}
