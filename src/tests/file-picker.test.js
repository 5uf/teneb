import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { extractKeywords, scoreFile, rankFiles, suggestFiles, walkFiles } from '../file-picker.js';

let tmp;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'teneb-picker-'));
  fs.mkdirSync(path.join(tmp, 'src'));
  fs.writeFileSync(path.join(tmp, 'src', 'auth.js'), '// auth');
  fs.writeFileSync(path.join(tmp, 'src', 'utils.js'), '// utils');
  fs.writeFileSync(path.join(tmp, 'src', 'auth-helper.ts'), '// helper');
  fs.writeFileSync(path.join(tmp, 'README.md'), 'readme');
  fs.mkdirSync(path.join(tmp, 'node_modules'));
  fs.writeFileSync(path.join(tmp, 'node_modules', 'skip.js'), 'skip');
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('extractKeywords', () => {
  test('extracts tokens >= 3 chars, lowercased', () => {
    const kw = extractKeywords('Fix the auth bug in src/auth.js');
    assert.ok(kw.includes('fix'));
    assert.ok(kw.includes('auth'));
    assert.ok(kw.includes('src'));
    assert.ok(!kw.includes('the'));
  });

  test('dedupes repeats', () => {
    const kw = extractKeywords('auth auth bug auth');
    assert.equal(kw.filter(w => w === 'auth').length, 1);
  });
});

describe('walkFiles', () => {
  test('skips node_modules', () => {
    const files = walkFiles(tmp);
    assert.ok(files.some(f => f.includes('auth.js')));
    assert.ok(!files.some(f => f.includes('node_modules')));
  });
});

describe('scoreFile', () => {
  test('higher score for files matching keywords', () => {
    const authScore = scoreFile(path.join(tmp, 'src/auth.js'), ['auth'], tmp);
    const utilsScore = scoreFile(path.join(tmp, 'src/utils.js'), ['auth'], tmp);
    assert.ok(authScore > utilsScore);
  });
});

describe('rankFiles', () => {
  test('returns files sorted by score, filters zero-score', () => {
    const all = walkFiles(tmp);
    const ranked = rankFiles(all, ['auth'], tmp);
    assert.ok(ranked.length >= 2);
    assert.ok(ranked[0].score >= ranked[1].score);
    assert.ok(!ranked.some(r => r.file.includes('utils')));
  });
});

describe('suggestFiles', () => {
  test('returns top-N file suggestions for prompt', () => {
    const sug = suggestFiles(tmp, 'fix the auth bug', 3);
    assert.ok(sug.length > 0);
    assert.ok(sug.length <= 3);
    assert.ok(sug[0].file.includes('auth'));
  });

  test('returns empty for no-keyword prompt', () => {
    const sug = suggestFiles(tmp, 'a', 3);
    assert.deepEqual(sug, []);
  });
});
