import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compilePrompt } from '../prompt-compiler.js';
import { semanticDeduplicate } from '../semantic-deduper.js';
import { microCompact, compactContextPack } from '../micro-compact.js';
import { buildSemanticGraph, compactSemanticGraph } from '../semantic-graph.js';
import { LearningStore } from '../learning-store.js';
import { ToolBroker } from '../tool-broker.js';
import { PredictiveExecutionPlanner } from '../predictive-planner.js';
import { verifyOutput } from '../verifier.js';
import { FIXTURES } from './fixtures.js';
import { computeAverages, summarizeBenchmark } from './metrics.js';
import { compactWithWasm } from '../wasm-bridge.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(__dirname, '../..');
const resultDir = path.join(projectDir, 'benchmarks', 'results');
fs.mkdirSync(resultDir, { recursive: true });

const store = new LearningStore(path.join(projectDir, '.teneb', 'learning.jsonl'));
const broker = new ToolBroker(store);
const planner = new PredictiveExecutionPlanner(broker, store);

function baselineMetrics(fixture) {
  return {
    fixture_id: fixture.id,
    baseline_tokens: Math.ceil(fixture.content.length / 4),
    baseline_tool_calls: 4,
    baseline: true
  };
}

async function runFixture(fixture) {
  const promptBrief = compilePrompt(fixture.prompt);
  const deduped = semanticDeduplicate(fixture.content);
  const compacted = microCompact(deduped, { maxLength: 220, aliasMinLength: 12 });
  const graph = buildSemanticGraph(fixture.content);
  const compactedGraph = compactSemanticGraph(graph, { maxNodes: 12 });
  const contextPack = compactContextPack({
    goal: promptBrief.prompt,
    resolved: ['prompt compiled'],
    open_questions: ['Which tool is safest?'],
    key_facts: ['Use minimal context', 'Avoid redundant tool calls'],
    next_step: 'Select tools',
    recommended_tools: []
  }, { maxLength: 180, aliasMinLength: 12 });

  const recommendation = broker.recommendTools(promptBrief);
  const prediction = planner.plan(promptBrief, {
    open_questions: ['Which tool is safest?'],
    key_facts: ['Use minimal context']
  }, []);
  const wasmResult = await compactWithWasm(fixture.content, { maxLength: 220 }, projectDir);
  const verification = verifyOutput(compacted.compacted, { maxTokens: 180 });

  const toolRecallAccuracy = fixture.id === 'research-dup'
    ? Number(recommendation.some((t) => ['WebSearch', 'WebFetch'].includes(t.name)) ? 1 : 0)
    : fixture.id === 'implementation-tools'
      ? Number(recommendation.some((t) => ['Read', 'Edit', 'Bash'].includes(t.name)) ? 1 : 0)
      : Number(recommendation.some((t) => ['Read', 'Edit'].includes(t.name)) ? 1 : 0);

  const reliabilityGain = recommendation.length
    ? recommendation.reduce((sum, t) => sum + t.reliability, 0) / recommendation.length - 0.5
    : 0;

  const optimizedText = [
    compacted.compacted,
    `tools:${recommendation.map((t) => t.name).join(',')}`,
    `next:${prediction.predicted_tool || 'none'}`,
    `graph_nodes:${compactedGraph.nodes.length}`,
    `wasm:${wasmResult.engine}`
  ].join('\n');

  return {
    fixture_id: fixture.id,
    task_type: promptBrief.task_type,
    before_tokens: Math.ceil(fixture.content.length / 4),
    after_tokens: Math.ceil(optimizedText.length / 4),
    token_reduction_ratio: Number((1 - optimizedText.length / fixture.content.length).toFixed(4)),
    dedupe_reduction: Number((1 - deduped.length / fixture.content.length).toFixed(4)),
    graph_nodes_before: graph.nodes.length,
    graph_nodes_after: compactedGraph.nodes.length,
    tool_recall_accuracy: Number(toolRecallAccuracy.toFixed(4)),
    reliability_gain: Number(reliabilityGain.toFixed(4)),
    verifier_ok: verification.ok,
    verifier_score: verification.grammar_score,
    prediction: prediction.predicted_tool,
    planned_steps: prediction.steps.length,
    wasm_engine: wasmResult.engine
  };
}

async function main() {
  const results = [];
  for (const fixture of FIXTURES) {
    const baseline = baselineMetrics(fixture);
    const optimized = await runFixture(fixture);
    results.push({
      ...baseline,
      ...optimized
    });
  }

  const summary = computeAverages(results);
  const payload = {
    generated_at: new Date().toISOString(),
    summary,
    results
  };

  fs.writeFileSync(path.join(resultDir, 'latest.json'), JSON.stringify(payload, null, 2));
  console.log(JSON.stringify(payload, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
