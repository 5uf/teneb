// MCP-specific output compression. Applied before generic microCompact.

// Heuristic: is this an MCP tool?
export function isMcpTool(toolName) {
  return typeof toolName === 'string' && toolName.startsWith('mcp__');
}

// Attempt to parse the output as JSON; return {parsed, ok}
function tryParse(text) {
  try { return { parsed: JSON.parse(text), ok: true }; }
  catch { return { parsed: null, ok: false }; }
}

// Truncate an array, keeping the first `keep` items plus a count marker
function truncateArray(arr, keep = 3) {
  if (!Array.isArray(arr) || arr.length <= keep) return arr;
  return [
    ...arr.slice(0, keep),
    { _teneb_truncated: true, original_length: arr.length, omitted: arr.length - keep }
  ];
}

// Recursively compact a JSON value:
// - arrays longer than 3 → keep first 3 items
// - strings longer than 500 chars → truncate with marker
// - null / undefined / empty → drop key
// - nested objects recurse, max depth 4
export function compactJson(value, depth = 0) {
  if (depth > 4) return '[truncated depth]';
  if (value === null || value === undefined) return value;

  if (Array.isArray(value)) {
    const capped = truncateArray(value, 3);
    return capped.map(v => compactJson(v, depth + 1));
  }

  if (typeof value === 'string') {
    if (value.length > 500) return value.slice(0, 500) + ` [+${value.length - 500} chars]`;
    return value;
  }

  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      // Drop null / undefined / empty string / empty array / empty object
      if (v === null || v === undefined) continue;
      if (typeof v === 'string' && v === '') continue;
      if (Array.isArray(v) && v.length === 0) continue;
      if (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) continue;
      out[k] = compactJson(v, depth + 1);
    }
    return out;
  }

  return value;
}

// Main entry: given raw MCP output (string), try to compact.
// Returns the compacted string (or original if not JSON / not MCP).
export function compactMcpOutput(toolName, rawOutput) {
  if (!isMcpTool(toolName)) return rawOutput;
  const text = String(rawOutput || '');
  if (text.length < 200) return text;

  const { parsed, ok } = tryParse(text);
  if (!ok) return text;

  const compacted = compactJson(parsed);
  return JSON.stringify(compacted);
}
