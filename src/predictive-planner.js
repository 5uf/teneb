import { semanticSimilarity } from './utils.js';

export class PredictiveExecutionPlanner {
  constructor(toolBroker, learningStore) {
    this.toolBroker = toolBroker;
    this.learningStore = learningStore;
  }

  plan(promptBrief, contextPack = {}, catalog = []) {
    const tools = this.toolBroker.recommendTools(promptBrief, catalog.length ? catalog : undefined);
    const hints = contextPack.open_questions || [];
    const hasResearchNeed = /\b(research|compare|evaluate|latest|source|docs)\b/i.test(promptBrief.prompt || '');

    const steps = [];
    steps.push({
      id: 'step-0',
      kind: 'context',
      action: 'compact_context',
      reason: 'Protect token budget before reasoning.'
    });

    if (tools.length) {
      for (const tool of tools.slice(0, 3)) {
        steps.push({
          id: `tool-${tool.name.toLowerCase()}`,
          kind: 'tool',
          tool: tool.name,
          confidence: tool.score,
          reason: tool.reason
        });
      }
    } else if (hasResearchNeed) {
      steps.push({
        id: 'tool-websearch',
        kind: 'tool',
        tool: 'WebSearch',
        confidence: 0.67,
        reason: 'Research-oriented request with no strong tool signal.'
      });
    }

    if (hints.length) {
      steps.push({
        id: 'step-verify',
        kind: 'verify',
        action: 'resolve_open_questions',
        reason: 'Close remaining gaps before answer finalization.'
      });
    }

    return {
      plan_id: `plan-${Date.now()}`,
      steps,
      predicted_tool: steps.find((s) => s.kind === 'tool')?.tool || null,
      confidence: steps.find((s) => s.kind === 'tool')?.confidence || 0.5,
      forecast: steps.map((s) => s.tool || s.action)
    };
  }

  rankCandidates(prompt, candidates = []) {
    const basis = String(prompt || '').toLowerCase();
    return candidates
      .map((item) => ({
        ...item,
        similarity: semanticSimilarity(basis, item.text || item.name || ''),
      }))
      .sort((a, b) => b.similarity - a.similarity);
  }
}
