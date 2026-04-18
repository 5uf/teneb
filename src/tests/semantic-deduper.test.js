import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  dedupeSentences,
  dedupeFacts,
  semanticDeduplicate,
  findRedundantClusters,
  dedupeTextBlocks
} from '../semantic-deduper.js';

describe('dedupeSentences', () => {
  test('removes exact duplicate sentences', () => {
    const text = 'Claude Code supports hooks. Claude Code supports hooks. MCP prompts become slash commands.';
    const result = dedupeSentences(text);
    const occurrences = (result.match(/Claude Code supports hooks/g) || []).length;
    assert.equal(occurrences, 1);
  });

  test('preserves unique sentences', () => {
    const text = 'First sentence. Second sentence. Third sentence.';
    const result = dedupeSentences(text);
    assert.match(result, /First sentence/);
    assert.match(result, /Second sentence/);
    assert.match(result, /Third sentence/);
  });

  test('handles empty string', () => {
    assert.equal(dedupeSentences(''), '');
  });

  test('near-duplicate removal at threshold 0.7', () => {
    // "should" vs "must" — trigram similarity ~0.72, caught at threshold 0.7 but not 0.9
    const text = 'The context window is finite and should be compressed. The context window is finite and must be compressed.';
    const result = dedupeSentences(text, 0.7);
    const parts = result.split('.').filter(Boolean);
    assert.ok(parts.length < 2, `Expected 1 sentence kept, got ${parts.length}: "${result}"`);
  });
});

describe('dedupeFacts', () => {
  test('dedupes string array', () => {
    const items = ['tool reliability scoring', 'tool reliability scoring', 'cross-session learning'];
    const result = dedupeFacts(items);
    assert.equal(result.length, 2);
  });

  test('dedupes object array by JSON key', () => {
    const items = [{ name: 'Read' }, { name: 'Read' }, { name: 'Edit' }];
    const result = dedupeFacts(items);
    assert.equal(result.length, 2);
  });

  test('preserves distinct items', () => {
    const items = ['alpha', 'beta', 'gamma'];
    const result = dedupeFacts(items);
    assert.equal(result.length, 3);
  });
});

describe('semanticDeduplicate', () => {
  test('dispatches to dedupeSentences for string input', () => {
    const text = 'Foo bar baz. Foo bar baz.';
    const result = semanticDeduplicate(text);
    assert.equal(typeof result, 'string');
    const count = (result.match(/Foo bar baz/g) || []).length;
    assert.equal(count, 1);
  });

  test('dispatches to dedupeFacts for array input', () => {
    // Use longer strings so trigrams produce signal; single chars produce no ngrams
    const result = semanticDeduplicate(['tool reliability scoring', 'tool reliability scoring', 'cross-session learning']);
    assert.ok(Array.isArray(result));
    assert.equal(result.length, 2);
  });
});

describe('findRedundantClusters', () => {
  test('finds clusters of similar sentences', () => {
    const text = [
      'The agent called the wrong tool.',
      'The agent called the wrong tool twice.',
      'Completely different topic about Rust.'
    ].join(' ');
    const clusters = findRedundantClusters(text, 0.5);
    assert.ok(clusters.length >= 1, 'Expected at least one cluster');
  });

  test('returns empty for fully unique sentences', () => {
    const text = 'Alpha. Beta. Gamma. Delta.';
    const clusters = findRedundantClusters(text, 0.99);
    assert.equal(clusters.length, 0);
  });
});

describe('dedupeTextBlocks', () => {
  test('removes duplicate string blocks', () => {
    const blocks = ['hello world', 'hello world', 'other text'];
    const result = dedupeTextBlocks(blocks);
    assert.equal(result.length, 2);
  });
});
