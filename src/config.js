import fs from 'node:fs';
import path from 'node:path';

export function defaultConfig(projectDir = process.cwd()) {
  return {
    projectDir,
    stateDir: path.join(projectDir, '.teneb'),
    learningFile: path.join(projectDir, '.teneb', 'learning.jsonl'),
    sessionsDir: path.join(projectDir, '.teneb', 'sessions'),
    benchmarkDir: path.join(projectDir, 'benchmarks'),
    autoInstall: {
      enabled: process.env.TENEB_AUTO_INSTALL === '1',
      requireConfirmation: true,
      allowedSources: ['npm', 'pypi', 'cargo'],
      allowSandboxOnly: true,
      allowedPackages: ['@anthropic-ai/*', '@openai/*', 'zod', 'jsonschema']
    },
    compaction: {
      maxSummaryLength: 240,
      duplicateSimilarityThreshold: 0.84,
      aliasMinLength: 16
    },
    toolReliability: {
      minScore: 0.55,
      preferKnownGood: true
    }
  };
}

export function loadJSONIfExists(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function mergeConfig(base, override) {
  return {
    ...base,
    ...override,
    autoInstall: { ...base.autoInstall, ...(override?.autoInstall || {}) },
    compaction: { ...base.compaction, ...(override?.compaction || {}) },
    toolReliability: { ...base.toolReliability, ...(override?.toolReliability || {}) }
  };
}

export function loadProjectConfig(projectDir = process.cwd()) {
  const base = defaultConfig(projectDir);
  const local = [
    path.join(projectDir, '.teneb', 'config.json'),
    path.join(projectDir, 'teneb.config.json')
  ].find((file) => fs.existsSync(file));
  if (!local) return base;
  const override = JSON.parse(fs.readFileSync(local, 'utf8'));
  return mergeConfig(base, override);
}
