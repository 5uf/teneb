import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(__dirname, '../..');
const resultPath = path.join(projectDir, 'benchmarks', 'results', 'latest.json');
const dashboardDir = path.join(projectDir, 'dashboard');
const outputPath = path.join(dashboardDir, 'report.html');

if (!fs.existsSync(resultPath)) {
  console.error('Run the benchmark first: node src/benchmark/benchmark.js');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
const embedded = JSON.stringify(data).replace(/</g, '\u003c');

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Teneb Benchmark Dashboard</title>
  <style>
    body { font-family: Inter, system-ui, sans-serif; background: #0b1020; color: #e5e7eb; margin: 0; padding: 24px; }
    .grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
    .card { background: #11172b; border: 1px solid #22304f; border-radius: 18px; padding: 18px; box-shadow: 0 10px 30px rgba(0,0,0,.25); }
    .muted { color: #9ca3af; font-size: 13px; }
    h1,h2,h3 { margin: 0 0 10px 0; }
    .metric { font-size: 34px; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #22304f; font-size: 14px; }
    canvas { width: 100%; height: 280px; background: #0f1528; border-radius: 16px; border: 1px solid #22304f; }
    .badge { display:inline-block; padding: 4px 8px; border-radius: 999px; background: #1f2a44; color: #cbd5e1; font-size: 12px; margin-right: 6px; }
  </style>
</head>
<body>
  <h1>Teneb Benchmark Dashboard</h1>
  <p class="muted">Generated: <span id="generated"></span></p>

  <div class="grid">
    <div class="card"><div class="muted">Average token reduction</div><div class="metric" id="tokenReduction"></div></div>
    <div class="card"><div class="muted">Average tool recall</div><div class="metric" id="toolRecall"></div></div>
    <div class="card"><div class="muted">Average verifier score</div><div class="metric" id="verifier"></div></div>
    <div class="card"><div class="muted">WASM engine</div><div class="metric" id="wasm"></div></div>
  </div>

  <div class="card" style="margin-top:16px;">
    <h2>Token reduction by fixture</h2>
    <canvas id="chart" width="1200" height="320"></canvas>
  </div>

  <div class="card" style="margin-top:16px;">
    <h2>Fixture results</h2>
    <table>
      <thead>
        <tr>
          <th>Fixture</th>
          <th>Before</th>
          <th>After</th>
          <th>Reduction</th>
          <th>Tool recall</th>
          <th>Verifier</th>
          <th>WASM</th>
        </tr>
      </thead>
      <tbody id="rows"></tbody>
    </table>
  </div>

  <script>
    const data = ${embedded};
    document.getElementById('generated').textContent = data.generated_at;
    document.getElementById('tokenReduction').textContent = (data.summary.token_reduction_ratio * 100).toFixed(1) + '%';
    document.getElementById('toolRecall').textContent = (data.summary.tool_recall_accuracy * 100).toFixed(1) + '%';
    document.getElementById('verifier').textContent = data.results.length ? ((data.results.reduce((a,r)=>a+r.verifier_score,0)/data.results.length).toFixed(2)) : '0.00';
    document.getElementById('wasm').textContent = data.results[0]?.wasm_engine || 'unknown';

    const tbody = document.getElementById('rows');
    for (const r of data.results) {
      const tr = document.createElement('tr');
      tr.innerHTML = \`
        <td>\${r.fixture_id}</td>
        <td>\${r.before_tokens}</td>
        <td>\${r.after_tokens}</td>
        <td>\${(r.token_reduction_ratio*100).toFixed(1)}%</td>
        <td>\${(r.tool_recall_accuracy*100).toFixed(1)}%</td>
        <td>\${r.verifier_score.toFixed(2)}</td>
        <td>\${r.wasm_engine}</td>
      \`;
      tbody.appendChild(tr);
    }

    const canvas = document.getElementById('chart');
    const ctx = canvas.getContext('2d');
    const max = Math.max(...data.results.map(r => Math.abs(r.token_reduction_ratio)), 0.01);
    const barW = 240;
    const gap = 80;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.font = '20px system-ui';
    ctx.fillStyle = '#d1d5db';
    data.results.forEach((r, idx) => {
      const x = 70 + idx * (barW + gap);
      const h = Math.round((r.token_reduction_ratio / max) * 180);
      ctx.fillStyle = '#7c3aed';
      ctx.fillRect(x, 220 - h, barW, h);
      ctx.fillStyle = '#e5e7eb';
      ctx.fillText(r.fixture_id, x, 250);
      ctx.fillText((r.token_reduction_ratio * 100).toFixed(1) + '%', x, 210 - h);
    });
  </script>
</body>
</html>`;

fs.mkdirSync(dashboardDir, { recursive: true });
fs.writeFileSync(outputPath, html, 'utf8');
console.log(`Wrote ${outputPath}`);
