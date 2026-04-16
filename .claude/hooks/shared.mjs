#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { compilePrompt } from '../../src/prompt-compiler.js';
import { microCompact, compactContextPack } from '../../src/micro-compact.js';
import { semanticDeduplicate, findRedundantClusters } from '../../src/semantic-deduper.js';
import { buildSemanticGraph, compactSemanticGraph, semanticGraphToContext } from '../../src/semantic-graph.js';
import { LearningStore } from '../../src/learning-store.js';
import { ToolBroker } from '../../src/tool-broker.js';
import { PredictiveExecutionPlanner } from '../../src/predictive-planner.js';
import { verifyOutput } from '../../src/verifier.js';
import { loadProjectConfig } from '../../src/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(__dirname, '../..');
const config = loadProjectConfig(projectDir);
const store = new LearningStore(config.learningFile);
const broker = new ToolBroker(store, config);
const planner = new PredictiveExecutionPlanner(broker, store);

function readInput() {
  return new Promise((resolve) => {
    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (input += chunk));
    process.stdin.on('end', () => {
      try { resolve(input ? JSON.parse(input) : {}); } catch { resolve({ raw: input }); }
    });
    if (process.stdin.isTTY) resolve({});
  });
}
