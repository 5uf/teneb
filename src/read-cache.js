import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const CACHE_FILENAME = 'read-cache.json';

function cachePath(projectDir) {
  return path.join(projectDir, '.teneb', CACHE_FILENAME);
}

function hashContent(text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex').slice(0, 16);
}

export function loadCache(projectDir) {
  try {
    const raw = fs.readFileSync(cachePath(projectDir), 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function saveCache(projectDir, cache) {
  const file = cachePath(projectDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cache));
  fs.renameSync(tmp, file);
}

export function getCached(projectDir, filePath) {
  const cache = loadCache(projectDir);
  return cache[filePath] || null;
}

export function setCached(projectDir, filePath, content) {
  const cache = loadCache(projectDir);
  cache[filePath] = { hash: hashContent(content), content, cached_at: new Date().toISOString() };
  saveCache(projectDir, cache);
}

// Produce a compact unified diff between two texts.
// Returns a string. If identical, returns "unchanged".
export function diffText(oldText, newText) {
  if (oldText === newText) return 'unchanged';

  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');

  // Simple line-by-line comparison (Myers diff is overkill here; this is for small code files).
  const diffs = [];
  let i = 0, j = 0;
  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      i++; j++;
    } else if (j < newLines.length && (i >= oldLines.length || !oldLines.includes(newLines[j], i))) {
      diffs.push(`+${j + 1}: ${newLines[j]}`);
      j++;
    } else if (i < oldLines.length) {
      diffs.push(`-${i + 1}: ${oldLines[i]}`);
      i++;
    } else {
      j++;
    }
    if (diffs.length > 40) {
      diffs.push(`[...diff truncated at 40 changes]`);
      break;
    }
  }
  return diffs.length === 0 ? 'unchanged' : diffs.join('\n');
}

// Main entry: given a Read tool output, check cache and return the replacement content.
// Returns { output, cacheHit, isIdentical }.
export function processReadOutput(projectDir, filePath, rawOutput) {
  if (!filePath) return { output: rawOutput, cacheHit: false, isIdentical: false };

  const prev = getCached(projectDir, filePath);
  if (!prev) {
    setCached(projectDir, filePath, rawOutput);
    return { output: rawOutput, cacheHit: false, isIdentical: false };
  }

  const newHash = hashContent(rawOutput);
  if (newHash === prev.hash) {
    return {
      output: `[Teneb: file unchanged since last read — ${filePath}]`,
      cacheHit: true,
      isIdentical: true
    };
  }

  const diff = diffText(prev.content, rawOutput);
  setCached(projectDir, filePath, rawOutput);
  return {
    output: `[Teneb diff since last read — ${filePath}]\n${diff}`,
    cacheHit: true,
    isIdentical: false
  };
}
