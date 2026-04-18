import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ToolBroker, DEFAULT_TOOLS } from '../tool-broker.js';
import { compilePrompt } from '../prompt-compiler.js';

// Minimal stub for LearningStore
const stubStore = {
  getToolStats: () => [],
  getFingerprint: () => ({ attempts: 0, success_rate: 0.5, avg_tokens_saved: 0, patterns: [] })
};

describe('ToolBroker.scoreTool', () => {
  const broker = new ToolBroker(stubStore, {});

  test('read gets high score for code-inspection prompt', () => {
    const brief = compilePrompt('read and inspect the codebase to find the bug');
    const readTool = DEFAULT_TOOLS.find((t) => t.name === 'Read');
    const score = broker.scoreTool(brief, readTool);
    assert.ok(score > 0.5, `Read score=${score} should be > 0.5 for code-inspection`);
  });

  test('websearch gets high score for research prompt', () => {
    const brief = compilePrompt('research the latest Claude Code hook API documentation');
    const webTool = DEFAULT_TOOLS.find((t) => t.name === 'WebSearch');
    const score = broker.scoreTool(brief, webTool);
    assert.ok(score > 0.3, `WebSearch score=${score} should be reasonable for research`);
  });

  test('score is in [0, 1]', () => {
    const brief = compilePrompt('fix the bug in the file');
    for (const tool of DEFAULT_TOOLS) {
      const score = broker.scoreTool(brief, tool);
      assert.ok(score >= 0 && score <= 1, `${tool.name} score ${score} out of range`);
    }
  });
});

describe('ToolBroker.recommendTools', () => {
  const broker = new ToolBroker(stubStore, {});

  test('returns array', () => {
    const brief = compilePrompt('fix the bug');
    const tools = broker.recommendTools(brief);
    assert.ok(Array.isArray(tools));
  });

  test('debugging prompt recommends Read/Edit/Bash', () => {
    const brief = compilePrompt('debug the broken authentication function');
    const tools = broker.recommendTools(brief, DEFAULT_TOOLS, { threshold: 0.3 });
    const names = tools.map((t) => t.name);
    assert.ok(names.some((n) => ['Read', 'Edit', 'Bash'].includes(n)),
      `Expected Read/Edit/Bash in ${names}`);
  });

  test('research prompt recommends WebSearch or WebFetch', () => {
    const brief = compilePrompt('research and compare the latest approaches');
    const tools = broker.recommendTools(brief, DEFAULT_TOOLS, { threshold: 0.3 });
    const names = tools.map((t) => t.name);
    assert.ok(names.some((n) => ['WebSearch', 'WebFetch'].includes(n)),
      `Expected WebSearch/WebFetch in ${names}`);
  });

  test('respects maxTools option', () => {
    const brief = compilePrompt('implement build fix and search');
    const tools = broker.recommendTools(brief, DEFAULT_TOOLS, { threshold: 0.1, maxTools: 2 });
    assert.ok(tools.length <= 2);
  });
});

describe('ToolBroker.shouldAutoInstall (policy gate)', () => {
  test('blocks when TENEB_AUTO_INSTALL not set', () => {
    const broker = new ToolBroker(stubStore, { autoInstall: { allowedPackages: ['zod'] } });
    const result = broker.shouldAutoInstall({ source: 'npm', package: 'zod', risk_score: 0 }, {});
    assert.equal(result.allowed, false);
    assert.match(result.reason, /TENEB_AUTO_INSTALL/);
  });

  test('blocks non-allowlisted source even with opt-in', () => {
    const broker = new ToolBroker(stubStore, { autoInstall: { allowedPackages: ['zod'] } });
    const env = { TENEB_AUTO_INSTALL: '1', TENEB_ENV_MODE: 'sandbox' };
    const result = broker.shouldAutoInstall({ source: 'github', package: 'zod', risk_score: 0 }, env);
    assert.equal(result.allowed, false);
    assert.match(result.reason, /not allowlisted/);
  });

  test('blocks non-allowlisted package with risk > 0.2', () => {
    const broker = new ToolBroker(stubStore, { autoInstall: { allowedPackages: [] } });
    const env = { TENEB_AUTO_INSTALL: '1', TENEB_ENV_MODE: 'sandbox' };
    const result = broker.shouldAutoInstall({ source: 'npm', package: 'evil-pkg', risk_score: 0.5 }, env);
    assert.equal(result.allowed, false);
  });

  test('blocks high risk score even when allowlisted', () => {
    const broker = new ToolBroker(stubStore, { autoInstall: { allowedPackages: ['safe-pkg'], allowSandboxOnly: false } });
    const env = { TENEB_AUTO_INSTALL: '1', TENEB_ENV_MODE: 'sandbox' };
    const result = broker.shouldAutoInstall({ source: 'npm', package: 'safe-pkg', risk_score: 0.8 }, env);
    assert.equal(result.allowed, false);
    assert.match(result.reason, /risk score/i);
  });

  test('allows allowlisted package at low risk in sandbox', () => {
    const broker = new ToolBroker(stubStore, {
      autoInstall: { allowedPackages: ['@anthropic-ai/*'], allowSandboxOnly: false }
    });
    const env = { TENEB_AUTO_INSTALL: '1', TENEB_ENV_MODE: 'sandbox' };
    const result = broker.shouldAutoInstall({ source: 'npm', package: '@anthropic-ai/sdk', risk_score: 0 }, env);
    assert.equal(result.allowed, true);
  });
});

describe('ToolBroker.reliabilityFor', () => {
  test('falls back to base reliability for unknown tool', () => {
    const broker = new ToolBroker(stubStore, {});
    const r = broker.reliabilityFor('Read');
    assert.equal(r, 0.95);
  });

  test('uses learning store data when available', () => {
    const storeWithData = {
      getToolStats: () => [{ tool: 'Read', reliability: 0.42 }],
      getFingerprint: () => ({ attempts: 0, success_rate: 0.5, patterns: [] })
    };
    const broker = new ToolBroker(storeWithData, {});
    assert.equal(broker.reliabilityFor('Read'), 0.42);
  });
});
