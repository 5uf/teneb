import { clamp, stableHash } from './utils.js';

const DEFAULT_TOOLS = [
  { name: 'Read', baseReliability: 0.95, latency: 0.1, tokenCost: 0.05, purpose: 'inspect files' },
  { name: 'Edit', baseReliability: 0.9, latency: 0.15, tokenCost: 0.08, purpose: 'modify files' },
  { name: 'Write', baseReliability: 0.9, latency: 0.15, tokenCost: 0.08, purpose: 'create files' },
  { name: 'Bash', baseReliability: 0.75, latency: 0.4, tokenCost: 0.12, purpose: 'execute commands' },
  { name: 'WebSearch', baseReliability: 0.8, latency: 0.35, tokenCost: 0.14, purpose: 'fresh information' },
  { name: 'WebFetch', baseReliability: 0.82, latency: 0.3, tokenCost: 0.13, purpose: 'retrieve pages' }
];

function heuristicNeed(promptBrief, toolName) {
  const text = promptBrief.normalized || promptBrief.prompt || '';
  const type = promptBrief.task_type;
  const map = {
    Read: /\b(code|file|repo|project|implementation|bug|refactor)\b/i.test(text),
    Edit: /\b(build|implement|fix|refactor|modify|update)\b/i.test(text),
    Write: /\b(generate|create|scaffold|write)\b/i.test(text),
    Bash: /\b(test|install|build|run|script|cli|terminal)\b/i.test(text),
    WebSearch: /\b(search|latest|research|compare|current|recent)\b/i.test(text),
    WebFetch: /\b(http|url|site|docs|page|article)\b/i.test(text)
  };
  if (type === 'debugging') return ['Read', 'Edit', 'Bash'].includes(toolName);
  if (type === 'analysis') return ['Read', 'WebSearch', 'WebFetch'].includes(toolName);
  return !!map[toolName];
}

export class ToolBroker {
  constructor(learningStore, config = {}) {
    this.learningStore = learningStore;
    this.config = config;
  }

  reliabilityFor(toolName) {
    const stat = this.learningStore.getToolStats().find((x) => x.tool === toolName);
    return stat ? stat.reliability : DEFAULT_TOOLS.find((t) => t.name === toolName)?.baseReliability ?? 0.5;
  }

  scoreTool(promptBrief, tool, options = {}) {
    const reliability = this.reliabilityFor(tool.name);
    const need = heuristicNeed(promptBrief, tool.name) ? 1 : 0.25;
    const researchBoost =
      promptBrief.task_type === 'analysis' && ['WebSearch', 'WebFetch'].includes(tool.name) ? 0.22 : 0;
    const installBoost =
      promptBrief.task_type === 'implementation' && ['Bash', 'Write', 'Edit', 'Read'].includes(tool.name) ? 0.12 : 0;
    const costPenalty = tool.tokenCost * (options.costWeight ?? 1);
    const latencyPenalty = tool.latency * (options.latencyWeight ?? 1);
    const value = need * 0.65 + reliability * 0.35 + researchBoost + installBoost;
    return clamp(value - costPenalty - latencyPenalty, 0, 1);
  }

  recommendTools(promptBrief, catalog = DEFAULT_TOOLS, options = {}) {
    const scored = catalog.map((tool) => ({
      ...tool,
      reliability: this.reliabilityFor(tool.name),
      score: this.scoreTool(promptBrief, tool, options),
      reason: heuristicNeed(promptBrief, tool.name)
        ? `Matches task type ${promptBrief.task_type}`
        : 'Low direct signal; useful as fallback'
    }))
    .sort((a, b) => b.score - a.score);

    const threshold = options.threshold ?? (promptBrief.task_type === 'analysis' ? 0.45 : 0.58);
    return scored.filter((t) => t.score >= threshold).slice(0, options.maxTools ?? 3);
  }

  predictiveNextStep(promptBrief, contextPack) {
    const tools = this.recommendTools(promptBrief);
    const nextTool = tools[0] || null;
    return {
      step: nextTool ? `Call ${nextTool.name}` : 'Answer directly',
      next_tool: nextTool?.name || null,
      confidence: nextTool ? nextTool.score : 0.5,
      rationale: nextTool ? nextTool.reason : 'No external tool needed'
    };
  }

  shouldAutoInstall(spec, env = process.env) {
    const source = String(spec.source || '').toLowerCase();
    const pkg = String(spec.package || '');
    const hasOptIn = env.TENEB_AUTO_INSTALL === '1';
    const sandbox = ['sandbox', 'ephemeral', 'isolated'].includes(String(env.TENEB_ENV_MODE || '').toLowerCase());
    const allowlistedSource = ['npm', 'pypi', 'cargo'].includes(source);
    const allowlistedPackage = (this.config?.autoInstall?.allowedPackages || []).some((pattern) => {
      if (pattern.endsWith('/*')) return pkg.startsWith(pattern.slice(0, -1));
      return pattern === pkg;
    });
    const rawRisk = Number(spec.risk_score ?? 1);
    const riskScore = clamp(isNaN(rawRisk) ? 1 : rawRisk, 0, 1);

    if (!hasOptIn) {
      return { allowed: false, reason: 'Auto-install is disabled unless TENEB_AUTO_INSTALL=1 is set.' };
    }
    if (!allowlistedSource) {
      return { allowed: false, reason: `Source ${source || '(empty)'} is not allowlisted.` };
    }
    if (!sandbox && this.config?.autoInstall?.allowSandboxOnly !== false) {
      return { allowed: false, reason: 'Auto-install requires isolated or sandboxed execution.' };
    }
    if (!allowlistedPackage && riskScore > 0.2) {
      return { allowed: false, reason: 'Package is not allowlisted and risk is too high.' };
    }
    if (riskScore > 0.35) {
      return { allowed: false, reason: `Risk score ${riskScore.toFixed(2)} is above the auto-install gate.` };
    }

    return { allowed: true, reason: 'Safe to auto-install under current policy.' };
  }
}

export { DEFAULT_TOOLS };

export function toolCatalogSignature(catalog = DEFAULT_TOOLS) {
  return stableHash(catalog.map((t) => t.name).join('|'));
}
