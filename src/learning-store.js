import fs from 'node:fs';
import path from 'node:path';
import { nowIso, stableHash } from './utils.js';

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

export class LearningStore {
  constructor(filePath) {
    this.filePath = filePath;
    ensureDir(filePath);
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, '', 'utf8');
  }

  append(record) {
    const enriched = {
      id: stableHash({ t: nowIso(), record }),
      created_at: nowIso(),
      ...record
    };
    fs.appendFileSync(this.filePath, JSON.stringify(enriched) + '\n', 'utf8');
    return enriched;
  }

  readAll() {
    if (!fs.existsSync(this.filePath)) return [];
    const lines = fs.readFileSync(this.filePath, 'utf8').trim().split(/\n+/).filter(Boolean);
    return lines.map((line) => JSON.parse(line));
  }

  getToolStats() {
    const records = this.readAll();
    const byTool = new Map();

    for (const rec of records) {
      if (!rec.tool_name) continue;
      const tool = rec.tool_name;
      if (!byTool.has(tool)) {
        byTool.set(tool, { tool, attempts: 0, success: 0, avg_tokens_saved: 0, failures: [] });
      }
      const row = byTool.get(tool);
      row.attempts += 1;
      if (rec.success) row.success += 1;
      if (typeof rec.tokens_saved === 'number') {
        row.avg_tokens_saved = ((row.avg_tokens_saved * (row.attempts - 1)) + rec.tokens_saved) / row.attempts;
      }
      if (!rec.success) row.failures.push(rec.failure_mode || 'unknown');
    }

    return [...byTool.values()].map((row) => ({
      ...row,
      reliability: row.attempts ? row.success / row.attempts : 0
    }));
  }

  getFingerprint(taskType, toolNames = []) {
    const records = this.readAll().filter((r) => r.task_type === taskType);
    const related = records.filter((r) => !toolNames.length || toolNames.some((t) => (r.tool_names || []).includes(t)));
    const total = related.length || 1;
    const success = related.filter((r) => r.success).length;
    const avgSavings = related.reduce((sum, r) => sum + (r.tokens_saved || 0), 0) / total;
    return {
      task_type: taskType,
      tool_names: toolNames,
      attempts: total,
      success_rate: success / total,
      avg_tokens_saved: avgSavings,
      patterns: related.slice(-10).map((r) => r.pattern || r.failure_mode).filter(Boolean)
    };
  }

  recordTechnique(technique) {
    return this.append({ type: 'technique', ...technique });
  }

  recordMistake(mistake) {
    return this.append({ type: 'mistake', ...mistake });
  }

  recordRun(run) {
    return this.append({ type: 'run', ...run });
  }

  // Returns aggregate stats from the most recent `n` post-tool-compaction records.
  // Used by session-end to generate per-session summaries.
  getRecentStats(n = 100) {
    const records = this.readAll()
      .filter((r) => r.pattern === 'post-tool-compaction')
      .slice(-n);

    const total       = records.length;
    const success     = records.filter((r) => r.success).length;
    const tokensSaved = records.reduce((s, r) => s + (r.tokens_saved || 0), 0);
    const avgCompactMs = records.filter((r) => r.compact_ms > 0)
      .reduce((s, r, _, a) => s + r.compact_ms / a.length, 0);

    const toolCounts = {};
    for (const r of records) {
      if (r.tool_name) toolCounts[r.tool_name] = (toolCounts[r.tool_name] || 0) + 1;
    }
    const topTools = Object.entries(toolCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([t, c]) => `${t}(${c})`);

    return {
      tool_calls:     total,
      success_rate:   total ? Number((success / total).toFixed(3)) : 0,
      tokens_saved:   tokensSaved,
      avg_compact_ms: Math.round(avgCompactMs),
      top_tools:      topTools
    };
  }
}
