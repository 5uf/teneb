import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getTemplate, listTemplates, TEMPLATES } from '../prompts/templates.js';

describe('prompt templates', () => {
  test('listTemplates returns all names', () => {
    const names = listTemplates();
    assert.ok(names.includes('debug'));
    assert.ok(names.includes('review'));
    assert.ok(names.includes('refactor'));
    assert.ok(names.length >= 6);
  });

  test('getTemplate returns template body', () => {
    const t = getTemplate('debug');
    assert.ok(t.length > 50);
    assert.ok(t.toLowerCase().includes('root cause'));
  });

  test('getTemplate returns null for unknown name', () => {
    assert.equal(getTemplate('nonexistent'), null);
  });

  test('all templates are non-empty strings', () => {
    for (const [name, body] of Object.entries(TEMPLATES)) {
      assert.equal(typeof body, 'string', `${name} body not string`);
      assert.ok(body.length > 20, `${name} too short`);
    }
  });
});
