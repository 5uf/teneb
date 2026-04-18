/**
 * live-ab.js — Real A/B benchmark: runs defined prompts through Claude Code
 * with and without Teneb hooks and compares actual token/cost metrics.
 *
 * Usage:
 *   npm run live-ab                              # 3 runs, default prompt
 *   npm run live-ab -- --runs 5                  # 5 alternating pairs
 *   npm run live-ab -- --prompt-set code         # code prompts only
 *   npm run live-ab -- --prompt-set all          # all categorized prompts
 *   npm run live-ab -- --prompt "Read x, do y"  # custom single prompt
 *   npm run live-ab -- --runs 3 --prompt-set debug
 *
 * How alternating order works:
 *   Even pairs (0,2,…): without-hooks first → with-hooks second
 *   Odd  pairs (1,3,…): with-hooks first  → without-hooks second
 *   This cancels cold-cache bias. Deltas from pairs 1+ reflect steady-state.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolvePromptSet } from './prompts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = path.resolve(__dirname, '../..');
const SETTINGS     = path.join(PROJECT_DIR, '.claude', 'settings.json');
const SETTINGS_BAK = SETTINGS + '.bak';
const RESULTS_DIR  = path.join(PROJECT_DIR, 'benchmarks', 'results');

// ── CLI args ──────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag, def) => {
    const i = args.indexOf(flag);
    return i !== -1 && args[i + 1] ? args[i + 1] : def;
  };
  return {
    runs:         Math.max(1, parseInt(get('--runs', '3'), 10)),
    promptSet:    get('--prompt-set', null),
    customPrompt: get('--prompt', null),
    noSave:       args.includes('--no-save'),
  };
}

// ── Claude runner ─────────────────────────────────────────────────────────────

function runClaude(prompt) {
  return new Promise((resolve, reject) => {
    const args = ['-p', prompt, '--output-format', 'stream-json', '--no-session-persistence'];
    const child = spawn('claude', args, { cwd: PROJECT_DIR, env: process.env });
    const lines = [];
    child.stdout.on('data', (chunk) => String(chunk).split('\n').filter(Boolean).forEach((l) => lines.push(l)));
    child.stderr.on('data', () => {});
    child.on('error', reject);
    child.on('close', () => {
      let result = null;
      let turns = 0;
      for (const line of lines) {
        try {
          const obj = JSON.parse(line);
          if (obj.type === 'result')    result = obj;
          if (obj.type === 'assistant') turns++;
        } catch {}
      }
      if (!result) { reject(new Error('No result event in claude output')); return; }
      resolve({
        input_tokens:   result.usage?.input_tokens ?? 0,
        output_tokens:  result.usage?.output_tokens ?? 0,
        cache_creation: result.usage?.cache_creation_input_tokens ?? 0,
        cache_read:     result.usage?.cache_read_input_tokens ?? 0,
        cost_usd:       result.total_cost_usd ?? 0,
        duration_ms:    result.duration_ms ?? 0,
        turns
      });
    });
  });
}

// ── Hook toggle ───────────────────────────────────────────────────────────────

function disableHooks() {
  if (fs.existsSync(SETTINGS)) fs.renameSync(SETTINGS, SETTINGS_BAK);
}

function enableHooks() {
  if (fs.existsSync(SETTINGS_BAK)) fs.renameSync(SETTINGS_BAK, SETTINGS);
}

async function runWithout(prompt) {
  disableHooks();
  try { return await runClaude(prompt); }
  finally { enableHooks(); }
}

async function runWith(prompt) {
  return await runClaude(prompt);
}

// ── Stats helpers ─────────────────────────────────────────────────────────────

function mean(arr)   { return arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0; }
function stddev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, x) => s + (x - m) ** 2, 0) / arr.length);
}
function pct(a, b)   { return a ? (((b - a) / a) * 100).toFixed(1) + '%' : '─'; }
function sign(n)     { return n > 0 ? '+' + n : String(n); }
function signF(n, d = 4) { const s = n.toFixed(d); return n > 0 ? '+' + s : s; }

// ── Formatting ────────────────────────────────────────────────────────────────

function col(s, n)  { return String(s).slice(0, n).padEnd(n); }
function rCol(s, n) { return String(s).padStart(n); }

// ── Single prompt benchmark ───────────────────────────────────────────────────

async function benchmarkPrompt(promptObj, numRuns) {
  const results = [];

  for (let i = 0; i < numRuns; i++) {
    const even      = i % 2 === 0;    // even=without first, odd=with first
    const pairLabel = even ? 'without→with' : 'with→without';
    process.stdout.write(`  pair ${i + 1}/${numRuns} [${pairLabel}] `);

    let without, withT;

    if (even) {
      process.stdout.write('running without... ');
      without = await runWithout(promptObj.prompt);
      process.stdout.write('running with... ');
      withT = await runWith(promptObj.prompt);
    } else {
      process.stdout.write('running with... ');
      withT = await runWith(promptObj.prompt);
      process.stdout.write('running without... ');
      without = await runWithout(promptObj.prompt);
    }

    const delta_cache = withT.cache_creation - without.cache_creation;
    const delta_cost  = withT.cost_usd - without.cost_usd;
    process.stdout.write(`done  cache_delta=${sign(delta_cache)}  cost_delta=${signF(delta_cost, 4)}\n`);

    results.push({ pair: i + 1, order: pairLabel, without, withT, delta_cache, delta_cost });
  }

  return results;
}

// ── Summary for one prompt ────────────────────────────────────────────────────

function summarizePrompt(promptObj, results) {
  const SEP  = '─'.repeat(80);
  const SEP2 = '─'.repeat(80);

  console.log(`\n  ${SEP}`);
  console.log(`  ${col('pair', 6)} ${col('order', 16)} ${rCol('cache_without', 14)} ${rCol('cache_with', 11)} ${rCol('Δcache', 9)} ${rCol('Δcost($)', 10)}`);
  console.log(`  ${SEP}`);

  for (const r of results) {
    console.log(
      `  ${rCol(r.pair, 4)}   ${col(r.order, 16)} ` +
      `${rCol(r.without.cache_creation, 14)} ${rCol(r.withT.cache_creation, 11)} ` +
      `${rCol(sign(r.delta_cache), 9)} ${rCol(signF(r.delta_cost, 4), 10)}`
    );
  }

  // Warm-cache pairs (index 1+) give steady-state signal
  const warm   = results.slice(1);
  const cold   = results[0];
  const cDeltas = results.map((r) => r.delta_cache);
  const costDeltas = results.map((r) => r.delta_cost);

  console.log(`  ${SEP2}`);
  if (results.length > 1) {
    console.log(`  mean  Δcache: ${sign(Math.round(mean(cDeltas)))} ± ${Math.round(stddev(cDeltas))}  (cold pair 1 is most variable)`);
    if (warm.length) {
      console.log(`  warm  Δcache: ${sign(Math.round(mean(warm.map((r) => r.delta_cache))))} (pairs 2+ only)`);
    }
    console.log(`  mean  Δcost:  ${signF(mean(costDeltas), 4)} ± ${stddev(costDeltas).toFixed(4)}`);
  } else {
    const r = results[0];
    if (r.delta_cache < 0) {
      console.log(`  Teneb reduced cache_creation by ${-r.delta_cache} tokens (${pct(r.without.cache_creation, r.withT.cache_creation)})`);
    }
    console.log(`  cost: without=${r.without.cost_usd.toFixed(4)}  with=${r.withT.cost_usd.toFixed(4)}  delta=${signF(r.delta_cost, 4)}`);
  }

  return { cDeltas, costDeltas };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const { runs, promptSet, customPrompt, noSave } = parseArgs();
  const prompts = resolvePromptSet(promptSet, customPrompt);

  console.log(`\nTeneb Live A/B Benchmark`);
  console.log(`Runs per prompt: ${runs}  |  Prompts: ${prompts.length}  |  Total API calls: ${runs * 2 * prompts.length}\n`);

  const allResults = [];

  for (const promptObj of prompts) {
    console.log(`\nPrompt [${promptObj.category}/${promptObj.id}]: ${promptObj.prompt.slice(0, 70)}...`);
    const results = await benchmarkPrompt(promptObj, runs);
    const { cDeltas, costDeltas } = summarizePrompt(promptObj, results);
    allResults.push({ prompt: promptObj, results, cDeltas, costDeltas });
  }

  // ── Cross-prompt aggregate ────────────────────────────────────────────────
  if (prompts.length > 1) {
    const allCDeltas   = allResults.flatMap((r) => r.cDeltas);
    const allCostDeltas = allResults.flatMap((r) => r.costDeltas);
    const SEP = '═'.repeat(80);
    console.log(`\n${SEP}`);
    console.log('AGGREGATE ACROSS ALL PROMPTS');
    console.log(SEP);
    console.log(`cache_creation Δ: mean=${sign(Math.round(mean(allCDeltas)))} ± ${Math.round(stddev(allCDeltas))}`);
    console.log(`cost_usd       Δ: mean=${signF(mean(allCostDeltas), 4)} ± ${stddev(allCostDeltas).toFixed(4)}`);
    console.log(SEP);
  }

  // ── Save JSON ─────────────────────────────────────────────────────────────
  if (!noSave) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const outFile = path.join(RESULTS_DIR, `live-ab-${ts}.json`);
    const payload = {
      generated_at: new Date().toISOString(),
      runs,
      prompts: prompts.length,
      results: allResults.map(({ prompt, results, cDeltas, costDeltas }) => ({
        prompt_id: prompt.id,
        category: prompt.category,
        pairs: results.map(({ pair, order, without, withT, delta_cache, delta_cost }) => ({
          pair, order, delta_cache, delta_cost,
          without: { cache_creation: without.cache_creation, cost_usd: without.cost_usd, duration_ms: without.duration_ms },
          with:    { cache_creation: withT.cache_creation,   cost_usd: withT.cost_usd,   duration_ms: withT.duration_ms   }
        })),
        summary: { mean_cache_delta: Math.round(mean(cDeltas)), stddev_cache_delta: Math.round(stddev(cDeltas)), mean_cost_delta: mean(costDeltas) }
      }))
    };
    fs.writeFileSync(outFile, JSON.stringify(payload, null, 2));
    console.log(`\nResults saved: ${path.relative(PROJECT_DIR, outFile)}`);
  }

  console.log();
}

main().catch((err) => { console.error('\nError:', err.message); process.exit(1); });
