import { normalizeText, extractPhrases, stableHash } from './utils.js';

export function buildSemanticGraph(text, options = {}) {
  const phrases = extractPhrases(text);
  const sentences = String(text || '')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const nodes = new Map();
  const edges = [];

  const addNode = (label, type = 'concept') => {
    const key = normalizeText(label);
    if (!key) return null;
    if (!nodes.has(key)) {
      nodes.set(key, {
        id: stableHash(key),
        label,
        type,
        mentions: 0
      });
    }
    nodes.get(key).mentions += 1;
    return nodes.get(key);
  };

  for (const phrase of phrases.slice(0, 40)) addNode(phrase);
  for (const sentence of sentences.slice(0, 60)) {
    const parent = addNode(sentence.slice(0, 48), 'sentence');
    for (const concept of extractPhrases(sentence).slice(0, 8)) {
      const child = addNode(concept);
      if (parent && child && parent.id !== child.id) {
        edges.push({ from: parent.id, to: child.id, kind: 'mentions' });
      }
    }
  }

  const compactedNodes = [...nodes.values()]
    .sort((a, b) => b.mentions - a.mentions)
    .map((n) => ({
      ...n,
      cluster: n.mentions > 1 ? `cluster:${n.id.slice(0, 6)}` : null
    }));

  const graphSignature = stableHash({
    nodes: compactedNodes.map((n) => n.label),
    edges: edges.length
  });

  return {
    nodes: compactedNodes,
    edges,
    signature: graphSignature
  };
}

export function compactSemanticGraph(graph, options = {}) {
  const maxNodes = options.maxNodes ?? 20;
  const topNodes = [...graph.nodes]
    .sort((a, b) => (b.mentions || 0) - (a.mentions || 0))
    .slice(0, maxNodes);
  const keepIds = new Set(topNodes.map((n) => n.id));
  const edges = graph.edges.filter((e) => keepIds.has(e.from) && keepIds.has(e.to));
  return {
    ...graph,
    nodes: topNodes,
    edges
  };
}

export function semanticGraphToContext(graph) {
  return {
    nodes: graph.nodes.map((n) => `${n.label}${n.mentions > 1 ? ` x${n.mentions}` : ''}`),
    edges: graph.edges.slice(0, 50).map((e) => `${e.from}->${e.to}`)
  };
}
