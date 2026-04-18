import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIXTURES } from './fixtures.js';
import { semanticDeduplicate } from '../semantic-deduper.js';
import { microCompact } from '../micro-compact.js';
import { compactWithWasm } from '../wasm-bridge.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(__dirname, '../..');
const captureDir = path.join(projectDir, 'benchmarks', 'captures');

async function runPipelines(text) {
  const raw = Math.ceil(text.length / 4);

  // Teneb full pipeline: semantic dedup → micro-compact → WASM (or JS fallback)
  const deduped = semanticDeduplicate(text);
  const compacted = microCompact(deduped, { maxLength: 220, aliasMinLength: 12 });
  const wasm = await compactWithWasm(compacted.compacted, { maxLength: 220 }, projectDir);
  const teneb = Math.ceil(wasm.compacted.length / 4);

  return { raw, teneb, engine: wasm.engine };
}

function pct(before, after) {
  return before ? (((before - after) / before) * 100).toFixed(1) + '%' : '─';
}

function col(s, n)  { return String(s).slice(0, n).padEnd(n); }
function rCol(s, n) { return String(s).padStart(n); }

async function main() {
  const inputs = [];

  for (const f of FIXTURES) {
    inputs.push({ source: f.id, type: 'fixture', text: f.content });
  }

  let hasCaptures = false;
  if (fs.existsSync(captureDir)) {
    const files = fs.readdirSync(captureDir).filter((f) => f.endsWith('.json')).sort();
    for (const file of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(captureDir, file), 'utf8'));
        if (data.raw_output) {
          inputs.push({ source: file, type: 'capture', text: data.raw_output });
          hasCaptures = true;
        }
      } catch {
        process.stderr.write(`  warning: skipping ${file} (parse error)\n`);
      }
    }
  }

  if (!hasCaptures) {
    console.log('\nNo real captures yet. To collect them, open Claude Code with:');
    console.log('  TENEB_CAPTURE=1 claude\n');
  }

  const SEP = '─'.repeat(76);
  console.log(
    '\n' +
    col('source', 30) + col('type', 9) +
    rCol('raw_tok', 8) + rCol('teneb_tok', 10) + rCol('reduction', 11) + '  engine'
  );
  console.log(SEP);

  let totalRaw = 0, totalTeneb = 0;

  for (const input of inputs) {
    const { raw, teneb, engine } = await runPipelines(input.text);
    totalRaw += raw;
    totalTeneb += teneb;
    console.log(
      col(input.source, 30) + col(input.type, 9) +
      rCol(raw, 8) + rCol(teneb, 10) +
      rCol(pct(raw, teneb), 11) + '  ' + engine
    );
  }

  console.log(SEP);
  const n = inputs.length || 1;
  console.log(
    col('AVERAGE', 30) + col('', 9) +
    rCol(Math.round(totalRaw / n), 8) + rCol(Math.round(totalTeneb / n), 10) +
    rCol(pct(totalRaw, totalTeneb), 11)
  );
  console.log();
}

main().catch((err) => { console.error(err); process.exit(1); });
