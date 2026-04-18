import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isMcpTool, compactJson, compactMcpOutput } from '../mcp-compactor.js';

describe('isMcpTool', () => {
  test('true for mcp__ prefix', () => {
    assert.equal(isMcpTool('mcp__serena__find_symbol'), true);
    assert.equal(isMcpTool('mcp__plugin_figma_figma__get_metadata'), true);
  });
  test('false for normal tools', () => {
    assert.equal(isMcpTool('Read'), false);
    assert.equal(isMcpTool('Bash'), false);
    assert.equal(isMcpTool(''), false);
    assert.equal(isMcpTool(null), false);
  });
});

describe('compactJson', () => {
  test('truncates long arrays to 3 + marker', () => {
    const r = compactJson({ items: [1, 2, 3, 4, 5, 6] });
    assert.equal(r.items.length, 4);
    assert.ok(r.items[3]._teneb_truncated);
    assert.equal(r.items[3].original_length, 6);
  });

  test('keeps short arrays intact', () => {
    const r = compactJson({ items: [1, 2] });
    assert.deepEqual(r.items, [1, 2]);
  });

  test('truncates long strings with char count', () => {
    const long = 'x'.repeat(600);
    const r = compactJson({ text: long });
    assert.ok(r.text.length < 600);
    assert.ok(r.text.includes('+100 chars'));
  });

  test('drops null, undefined, empty values', () => {
    const r = compactJson({ a: 1, b: null, c: undefined, d: '', e: [], f: {} });
    assert.deepEqual(Object.keys(r), ['a']);
  });

  test('recurses into nested objects', () => {
    const r = compactJson({ outer: { inner: [1, 2, 3, 4, 5] } });
    assert.equal(r.outer.inner.length, 4);
  });

  test('stops at depth 5', () => {
    const deep = { a: { b: { c: { d: { e: { f: 'too deep' } } } } } };
    const r = compactJson(deep);
    const str = JSON.stringify(r);
    assert.ok(str.includes('truncated depth'));
  });
});

describe('compactMcpOutput', () => {
  test('returns input for non-MCP tools', () => {
    assert.equal(compactMcpOutput('Read', 'some output'), 'some output');
  });

  test('returns input for small MCP outputs', () => {
    assert.equal(compactMcpOutput('mcp__x__y', 'short'), 'short');
  });

  test('returns input for non-JSON MCP outputs', () => {
    const big = 'not json ' + 'x'.repeat(300);
    assert.equal(compactMcpOutput('mcp__x__y', big), big);
  });

  test('compacts JSON MCP output with large arrays', () => {
    const payload = JSON.stringify({ results: Array.from({length: 20}, (_, i) => ({ id: i, name: `item${i}` })) });
    const compacted = compactMcpOutput('mcp__serena__find_symbol', payload);
    assert.ok(compacted.length < payload.length);
    const reparsed = JSON.parse(compacted);
    assert.equal(reparsed.results.length, 4); // 3 + marker
    assert.ok(reparsed.results[3]._teneb_truncated);
  });

  test('drops empty/null fields in MCP output', () => {
    const payload = JSON.stringify({ a: 1, b: null, c: '', data: Array.from({length: 10}, (_, i) => i), padding: 'x'.repeat(250) });
    const compacted = compactMcpOutput('mcp__x__y', payload);
    const r = JSON.parse(compacted);
    assert.equal(r.b, undefined);
    assert.equal(r.c, undefined);
    assert.equal(r.a, 1);
  });
});
