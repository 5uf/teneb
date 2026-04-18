import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { microCompact, compactContextPack } from '../micro-compact.js';

describe('microCompact', () => {
  test('returns compacted shorter than original for verbose input', () => {
    const input = 'really actually this is just basically a very long sentence that repeats. really actually this is just basically a very long sentence that repeats.';
    const { compacted, stats } = microCompact(input, { maxLength: 280 });
    assert.ok(compacted.length > 0, 'compacted not empty');
    assert.ok(stats.before_tokens > 0, 'before_tokens > 0');
    assert.ok(stats.after_tokens > 0, 'after_tokens > 0');
    assert.ok(stats.reduction_ratio > 0, 'reduction_ratio > 0');
  });

  test('strips filler words', () => {
    const input = 'really very actually basically simply just do the thing';
    const { compacted } = microCompact(input, { maxLength: 280 });
    assert.doesNotMatch(compacted, /\breally\b/i);
    assert.doesNotMatch(compacted, /\bactually\b/i);
    assert.doesNotMatch(compacted, /\bbasically\b/i);
  });

  test('truncates to maxLength', () => {
    const input = 'word '.repeat(200);
    const { compacted } = microCompact(input, { maxLength: 100 });
    assert.ok(compacted.length <= 120, `compacted.length=${compacted.length} should be near 100`);
  });

  test('returns alias_map and stats', () => {
    const { alias_map, stats } = microCompact('semantic-deduplication is a core concept. semantic-deduplication reduces tokens.', { aliasMinLength: 10 });
    assert.ok(typeof alias_map === 'object');
    assert.ok(typeof stats.signature === 'string');
    assert.ok(stats.signature.length > 0);
  });

  test('handles empty string', () => {
    const { compacted, stats } = microCompact('');
    assert.ok(typeof compacted === 'string');
    assert.equal(stats.reduction_ratio, 0);
  });

  test('handles object input (JSON-serialised)', () => {
    const { compacted } = microCompact({ goal: 'test', key_facts: ['a', 'b'] });
    assert.ok(typeof compacted === 'string');
    assert.ok(compacted.length > 0);
  });
});

describe('compactContextPack', () => {
  test('compacts a structured context pack', () => {
    const pack = {
      goal: 'Reduce tokens',
      resolved: ['Prompt compiled', 'Context packed'],
      open_questions: ['Which tool?'],
      key_facts: ['Use Read not WebFetch', 'Avoid duplicate tool calls'],
      next_step: 'Select tools',
      recommended_tools: [{ name: 'Read' }]
    };
    const result = compactContextPack(pack, { maxLength: 280 });
    assert.ok(result.compacted.length > 0);
    assert.ok(result.stats.before_tokens > 0);
  });
});
