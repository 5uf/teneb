import fs from 'node:fs';
import path from 'node:path';

// Directories to skip when walking the project tree
const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.teneb',
  '.next', '.nuxt', 'coverage', 'target', '__pycache__',
  '.venv', 'venv', '.claude2', 'benchmarks/captures'
]);

// File extensions worth indexing as source
const SOURCE_EXTS = new Set([
  '.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs',
  '.py', '.rs', '.go', '.rb', '.java', '.kt',
  '.css', '.scss', '.html', '.md', '.json', '.yaml', '.yml', '.toml'
]);

const MAX_FILES = 2000;
const MAX_DEPTH = 8;

export function walkFiles(root, depth = 0, acc = []) {
  if (depth > MAX_DEPTH || acc.length >= MAX_FILES) return acc;
  let entries;
  try { entries = fs.readdirSync(root, { withFileTypes: true }); }
  catch { return acc; }

  for (const entry of entries) {
    if (acc.length >= MAX_FILES) break;
    if (entry.name.startsWith('.') && !['.claude', '.github'].includes(entry.name)) continue;
    if (IGNORE_DIRS.has(entry.name)) continue;
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, depth + 1, acc);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (SOURCE_EXTS.has(ext)) acc.push(full);
    }
  }
  return acc;
}

// Extract keywords from a prompt — lowercase tokens of length >= 3, skipping stopwords
const STOP = new Set(['the','and','for','are','was','with','this','that','what','how','why','when','where','which','from','into','about','your','our','their','any','all','but','not','you','i']);

export function extractKeywords(text) {
  const words = String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9_-]+/)
    .filter(w => w.length >= 3 && !STOP.has(w));
  // Deduplicate, preserve order
  return [...new Set(words)];
}

// Score a file path by how many prompt keywords it contains (filename + directory)
export function scoreFile(filePath, keywords, projectRoot) {
  const rel = path.relative(projectRoot, filePath).toLowerCase();
  const parts = rel.split(/[\/._-]/).filter(Boolean);
  let hits = 0;
  for (const kw of keywords) {
    if (rel.includes(kw)) hits += 2;
    if (parts.includes(kw)) hits += 3;
  }
  return hits;
}

export function rankFiles(files, keywords, projectRoot) {
  return files
    .map(f => ({ file: path.relative(projectRoot, f), score: scoreFile(f, keywords, projectRoot) }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score);
}

// Main entry: given a prompt and project dir, return top-N file suggestions
export function suggestFiles(projectDir, promptText, max = 3) {
  const keywords = extractKeywords(promptText);
  if (keywords.length === 0) return [];
  const all = walkFiles(projectDir);
  const ranked = rankFiles(all, keywords, projectDir);
  return ranked.slice(0, max);
}
