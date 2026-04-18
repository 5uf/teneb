/**
 * prompt-guard.js — Prompt quality gate: auto-corrects typos and blocks ambiguous prompts.
 */

// ~50 common programming typos → corrections
const TYPO_MAP = {
  fucntion: 'function',
  funciton: 'function',
  funcion: 'function',
  functon: 'function',
  reutrn: 'return',
  retrun: 'return',
  retunr: 'return',
  retrn: 'return',
  cosnt: 'const',
  conts: 'const',
  ocnst: 'const',
  improt: 'import',
  ipmort: 'import',
  imoprt: 'import',
  exoprt: 'export',
  exprot: 'export',
  expotr: 'export',
  awiat: 'await',
  awit: 'await',
  awawit: 'await',
  asnyc: 'async',
  asncy: 'async',
  aysnc: 'async',
  teh: 'the',
  hte: 'the',
  wiht: 'with',
  wtih: 'with',
  whit: 'with',
  ture: 'true',
  treu: 'true',
  flase: 'false',
  fasle: 'false',
  fales: 'false',
  lenght: 'length',
  lnegth: 'length',
  lengt: 'length',
  vlaue: 'value',
  valeu: 'value',
  vluae: 'value',
  stirng: 'string',
  strign: 'string',
  sring: 'string',
  nubmer: 'number',
  numebr: 'number',
  numbr: 'number',
  booelan: 'boolean',
  boolan: 'boolean',
  bolean: 'boolean',
  undefinied: 'undefined',
  undfined: 'undefined',
  udnefined: 'undefined',
  consoel: 'console',
  consloe: 'console',
  dcoument: 'document',
  docuemnt: 'document',
};

// Build regex map once at module load
const TYPO_REGEXES = Object.entries(TYPO_MAP).map(([typo, fix]) => ({
  regex: new RegExp(`\\b${typo}\\b`, 'gi'),
  fix,
}));

/**
 * Auto-correct common programming typos using whole-word replacement.
 * @param {string} text
 * @returns {string}
 */
export function autoCorrectTypos(text) {
  let result = text;
  for (const { regex, fix } of TYPO_REGEXES) {
    result = result.replace(regex, fix);
  }
  return result;
}

// --- Ambiguity checker ---

const CONFIRMATIONS = new Set([
  'yes', 'no', 'ok', 'okay', 'y', 'n', 'yep', 'nope', 'sure',
  'continue', 'stop', 'done', 'next', 'proceed', 'skip',
  'cancel', 'abort', 'retry', 'confirm', 'accept', 'reject',
  'go', 'quit', 'exit', 'back', 'undo', 'redo',
]);

const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'it', 'in', 'on', 'at', 'to', 'for',
  'of', 'and', 'or', 'but', 'not', 'this', 'that', 'with', 'from',
  'by', 'be', 'are', 'was', 'were', 'been', 'being', 'have', 'has',
  'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
  'may', 'might', 'can', 'shall', 'am', 'i', 'me', 'my', 'we',
  'our', 'you', 'your', 'he', 'she', 'they', 'them', 'its',
  'what', 'which', 'who', 'whom', 'how', 'when', 'where', 'why',
  'if', 'then', 'so', 'just', 'about', 'up', 'out', 'all', 'some',
  'there', 'here', 'very', 'also', 'too', 'any', 'each', 'every',
]);

const VERBS = new Set([
  'read', 'write', 'edit', 'fix', 'add', 'remove', 'delete', 'update',
  'create', 'build', 'run', 'test', 'check', 'find', 'search', 'show',
  'explain', 'describe', 'list', 'count', 'compare', 'debug', 'deploy',
  'install', 'refactor', 'implement', 'help', 'make', 'move', 'copy',
  'rename', 'merge', 'split', 'parse', 'format', 'lint', 'compile',
  'convert', 'generate', 'configure', 'setup', 'initialize', 'migrate',
  'optimize', 'improve', 'simplify', 'extract', 'inject', 'wrap',
  'unwrap', 'log', 'print', 'trace', 'monitor', 'watch', 'start',
  'stop', 'restart', 'reset', 'clear', 'clean', 'fetch', 'pull',
  'push', 'commit', 'revert', 'rebase', 'cherry-pick',
  'choose', 'pick', 'select', 'got', 'get', 'gets', 'getting',
  'want', 'need', 'mean', 'think', 'know', 'see', 'use', 'using',
  'like', 'prefer', 'try', 'tell', 'give', 'take', 'let',
  'work', 'does', 'did', 'done', 'am', 'is', 'are', 'was', 'were',
  'have', 'has', 'had', 'go', 'goes', 'come', 'came', 'put', 'set',
  'ask', 'answer', 'reply', 'respond', 'say', 'said', 'mention',
]);

// ~150 common programming / English nouns + adjectives
const COMMON_NOUNS = new Set([
  'file', 'files', 'code', 'bug', 'bugs', 'error', 'errors', 'function',
  'class', 'module', 'modules', 'variable', 'variables', 'array', 'object',
  'string', 'number', 'boolean', 'value', 'values', 'type', 'types',
  'name', 'names', 'path', 'paths', 'line', 'lines', 'method', 'methods',
  'property', 'properties', 'key', 'keys', 'data', 'database', 'table',
  'column', 'row', 'index', 'list', 'map', 'set', 'queue', 'stack',
  'tree', 'node', 'graph', 'edge', 'loop', 'condition', 'branch',
  'server', 'client', 'request', 'response', 'api', 'endpoint', 'route',
  'url', 'port', 'host', 'header', 'body', 'query', 'param', 'params',
  'config', 'configuration', 'settings', 'option', 'options', 'flag',
  'argument', 'arguments', 'parameter', 'parameters', 'input', 'output',
  'result', 'results', 'test', 'tests', 'spec', 'suite', 'case',
  'component', 'components', 'page', 'pages', 'view', 'views', 'template',
  'style', 'styles', 'script', 'scripts', 'package', 'packages',
  'dependency', 'dependencies', 'version', 'release', 'build', 'deploy',
  'log', 'logs', 'message', 'messages', 'event', 'events', 'handler',
  'callback', 'promise', 'async', 'sync', 'cache', 'memory', 'storage',
  'token', 'tokens', 'user', 'users', 'auth', 'authentication',
  'permission', 'permissions', 'role', 'roles', 'session', 'cookie',
  'schema', 'model', 'models', 'migration', 'migrations', 'seed',
  'hook', 'hooks', 'plugin', 'plugins', 'middleware', 'service',
  'controller', 'repository', 'interface', 'abstract', 'static',
  'public', 'private', 'protected', 'new', 'old', 'first', 'last',
  'next', 'previous', 'current', 'default', 'custom', 'local', 'global',
  'true', 'false', 'null', 'undefined', 'import', 'export', 'require',
  'return', 'const', 'let', 'var', 'class', 'extends', 'constructor',
  'syntax', 'pattern', 'patterns', 'issue', 'issues', 'problem',
  'solution', 'change', 'changes', 'diff', 'commit', 'branch',
  'directory', 'folder', 'workspace', 'project', 'app', 'application',
  'system', 'process', 'thread', 'task', 'job', 'worker', 'tool',
]);

// Combined known-English word set
const KNOWN_WORDS = new Set([...STOPWORDS, ...VERBS, ...COMMON_NOUNS]);

const CODE_PATTERN = /[`(){}\[\]=>]|\.js\b|\.ts\b|\.py\b|\.rs\b|\.go\b|\.java\b|\.rb\b|\.css\b|\.html\b|\.json\b|\.yaml\b|\.yml\b|\.toml\b|\.md\b/;
const PATH_PATTERN = /(?:^|\s)[\.~]?\/\w|src\/|lib\/|dist\/|node_modules\/|\.\.\/|\.\//;

const TIER_THRESHOLDS = { green: 3, yellow: 4, red: 5 };

/**
 * Check whether a prompt is too ambiguous to execute.
 * @param {string} text
 * @param {'green'|'yellow'|'red'} tier
 * @returns {{ blocked: boolean, reason?: string }}
 */
export function checkAmbiguity(text, tier = 'green') {
  const trimmed = text.trim();
  if (!trimmed) return { blocked: true, reason: 'Empty prompt.' };

  // Single letter → always allow (conversational reply)
  if (/^[a-zA-Z]$/.test(trimmed)) {
    return { blocked: false };
  }

  // Confirmations → always allow
  if (CONFIRMATIONS.has(trimmed.toLowerCase())) {
    return { blocked: false };
  }

  // Code patterns → always allow
  if (CODE_PATTERN.test(trimmed)) {
    return { blocked: false };
  }

  // File paths → always allow
  if (PATH_PATTERN.test(trimmed)) {
    return { blocked: false };
  }

  // Tokenize: split on whitespace, strip punctuation for word matching
  const rawTokens = trimmed.split(/\s+/).filter(Boolean);
  const words = rawTokens.map(w => w.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase()).filter(Boolean);

  // Gibberish check: >50% of words not in known set → blocked.
  // Numbers, single letters, and short words count as known.
  if (words.length >= 4) {
    const unknownCount = words.filter(w =>
      !KNOWN_WORDS.has(w) &&
      !/^\d+$/.test(w) &&
      w.length > 1
    ).length;
    const unknownRatio = unknownCount / words.length;
    if (unknownRatio > 0.5) {
      return { blocked: true, reason: 'Prompt appears to be gibberish — most words are unrecognized.' };
    }
  }

  // Content-token analysis
  const contentTokens = words.filter(w => !STOPWORDS.has(w));
  const hasVerb = words.some(w => VERBS.has(w));
  const threshold = TIER_THRESHOLDS[tier] || TIER_THRESHOLDS.green;

  // Too few content tokens → blocked unless there's a verb WITH something to act on
  if (contentTokens.length < threshold) {
    // A verb alone (e.g. "help") is still too vague — need verb + at least one target
    if (!hasVerb || contentTokens.length < 2) {
      return {
        blocked: true,
        reason: `Prompt too vague — need at least ${threshold} content words or a verb with context (tier: ${tier}).`,
      };
    }
  }

  // Red tier: require a verb even with enough tokens (unless code/path already passed above)
  if (tier === 'red' && !hasVerb) {
    return {
      blocked: true,
      reason: 'Red tier requires a programming verb (e.g. fix, add, refactor, explain).',
    };
  }

  return { blocked: false };
}
