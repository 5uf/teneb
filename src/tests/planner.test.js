import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PredictiveExecutionPlanner } from '../predictive-planner.js';
import { ToolBroker, DEFAULT_TOOLS } from '../tool-broker.js';
import { compilePrompt } from '../prompt-compiler.js';

const noopStore = {
  getToolStats: () => [],
  getFingerprint: () => ({ attempts: 0, success_rate: 0.5, patterns: [] })
};

const broker = new ToolBroker(noopStore, {});
const planner = new PredictiveExecutionPlanner(broker, noopStore);

describe('PredictiveExecutionPlanner.plan', () => {
  test('returns plan with id, steps, forecast', () => {
    const brief = compilePrompt('fix the bug in the auth module');
    const plan = planner.plan(brief, {}, DEFAULT_TOOLS);
    assert.ok(typeof plan.plan_id === 'string');
    assert.ok(Array.isArray(plan.steps));
    assert.ok(Array.isArray(plan.forecast));
    assert.ok(plan.steps.length >= 1);
  });

  test('first step is always context compaction', () => {
    const brief = compilePrompt('do something');
    const plan = planner.plan(brief, {}, DEFAULT_TOOLS);
    assert.equal(plan.steps[0].kind, 'context');
    assert.equal(plan.steps[0].action, 'compact_context');
  });

  test('research prompt includes tool step', () => {
    const brief = compilePrompt('research the latest Claude Code API docs');
    const plan = planner.plan(brief, {}, DEFAULT_TOOLS);
    const toolSteps = plan.steps.filter((s) => s.kind === 'tool');
    assert.ok(toolSteps.length >= 1, 'Expected at least one tool step for research prompt');
  });

  test('open questions produce verify step', () => {
    const brief = compilePrompt('implement a new feature');
    const plan = planner.plan(brief, { open_questions: ['Is API stable?'] }, DEFAULT_TOOLS);
    const verify = plan.steps.find((s) => s.kind === 'verify');
    assert.ok(verify, 'Expected verify step when open questions present');
  });

  test('confidence is in [0, 1]', () => {
    const brief = compilePrompt('fix code');
    const plan = planner.plan(brief, {}, DEFAULT_TOOLS);
    assert.ok(plan.confidence >= 0 && plan.confidence <= 1, `confidence=${plan.confidence}`);
  });

  test('session_boost is a number', () => {
    const brief = compilePrompt('debug');
    const plan = planner.plan(brief, {}, DEFAULT_TOOLS);
    assert.ok(typeof plan.session_boost === 'number');
  });

  test('session boost increases confidence with high prior success', () => {
    const richStore = {
      getToolStats: () => [],
      getFingerprint: () => ({ attempts: 10, success_rate: 0.95, avg_tokens_saved: 20, patterns: [] })
    };
    const richBroker = new ToolBroker(richStore, {});
    const richPlanner = new PredictiveExecutionPlanner(richBroker, richStore);
    const brief = compilePrompt('fix the bug');

    const baseStore = {
      getToolStats: () => [],
      getFingerprint: () => ({ attempts: 0, success_rate: 0.5, patterns: [] })
    };
    const baseBroker = new ToolBroker(baseStore, {});
    const basePlanner = new PredictiveExecutionPlanner(baseBroker, baseStore);

    const richPlan = richPlanner.plan(brief, {}, DEFAULT_TOOLS);
    const basePlan = basePlanner.plan(brief, {}, DEFAULT_TOOLS);

    assert.ok(richPlan.confidence >= basePlan.confidence,
      `rich confidence ${richPlan.confidence} should be >= base ${basePlan.confidence}`);
  });
});

describe('PredictiveExecutionPlanner.rankCandidates', () => {
  test('returns sorted by similarity', () => {
    const candidates = [
      { name: 'alpha', text: 'something unrelated' },
      { name: 'beta', text: 'fix the authentication bug' },
      { name: 'gamma', text: 'fix the auth bug in login' }
    ];
    const ranked = planner.rankCandidates('fix authentication bug', candidates);
    assert.ok(ranked[0].similarity >= ranked[ranked.length - 1].similarity);
  });

  test('handles empty candidates', () => {
    const ranked = planner.rankCandidates('anything', []);
    assert.deepEqual(ranked, []);
  });
});
