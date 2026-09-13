#!/usr/bin/env node
// tool-voice-proxy.js — OpenAI-compatible front that turns fm serve's narrated
// tool-call envelopes into real OpenAI `tool_calls`.
//
// Topology:  opencode  ->  :1981 (this proxy)  ->  fm-proxy :1977  ->  fm serve :1976
//
// Why: fm serve's on-device 3B model never populates OpenAI `tool_calls` on
// tool_choice "auto" — it NARRATES the call as a JSON object inside `content`
// (native form `{"tool_call":[{"name":...,"arguments":{...}}]}` per fm-proxy's
// README). This proxy:
//   1. injects a compact system instruction asking for exactly one such envelope
//      at the end of the reply,
//   2. watches the streamed content for an envelope (native or tolerated variant),
//   3. strips the envelope from the text and re-emits it as OpenAI tool_calls
//      deltas + finish_reason "tool_calls", so opencode executes the call,
//   4. passes everything through untouched when no valid envelope appears.
//
// Safety: an envelope is honored ONLY when it parses to a JSON object whose every
// tool name matches a tool actually offered in THIS request and it sits at FINAL
// position (nothing but whitespace / a closing fence after it). Anything malformed
// or non-matching falls back to pass-through text — this proxy never half-synthesizes.
//
// Config: PORT (1981), UPSTREAM (http://127.0.0.1:1977/v1). Zero dependencies.

const http = require("http");

const PORT = Number(process.env.PORT) || 1981;
const UPSTREAM = process.env.UPSTREAM || "http://127.0.0.1:1977/v1";
const UP = new URL(UPSTREAM);

const ARG_CHUNK = 64;            // mirrors fm-proxy.js:1093
const TXT_TAIL = 64;             // held-back text while scanning for an envelope start
const MAX_ENV = 2048;            // sanity cap on one envelope region
// fm serve leaks chat-template tokens into content (fm-proxy.js:28); they are single
// vocabulary tokens so a per-delta strip is safe. The proxy always strips — it
// already edits content by design.
const MARKERS = /<start_of_turn>|<end_of_turn>|<ctrl\d+>|<\|[^|>]*\|>/g;

// Round-2 injection v2: per-tool purpose rules + LIVE-DATA rule + tightened
// NO-TOOL rule (the 3B drifts to fenced-bash narration for file ops and invents
// webfetch for arithmetic unless the boundaries are spelled out).
const INSTRUCTION =
  "End with exactly one JSON object, nothing after it, no code fences: " +
  '{"tool_call":[{"name":"tool-name","arguments":{}}]}. ' +
  "Live data (weather, time, files, dirs, internet) requires the envelope with the best-fitting tool — never fake, guess, or show code-fence commands. " +
  "Facts you already know (basic math): answer in plain text, never call a tool.";

// Per-tool purpose hints appended after the instruction (only for offered tools).
const TOOL_PURPOSES = {
  weather_get_temperature: "live weather for a city",
  webfetch: "fetching a specific web page or URL",
  bash: "running shell/file commands (ls, cat, echo, curl)",
};

// ── envelope patterns ────────────────────────────────────────────────────────
// Native array form  {"tool_call": [{"name": ..., "arguments": {...}}]} or the
// tolerated string form {"tool_call":"<name>","arguments":{...}}.
// The weak model also drops the leading quote on the key ({tool_call":…) —
// the quotes are made optional at DETECTION time; tryParse() repairs parsing.
const P_TOOL_CALL = /\{\s*"?tool_call"?\s*:/;
// OpenAI style      {"tool_calls": [{...}]}
const P_TOOL_CALLS = /\{\s*"?tool_calls"?\s*:/;
// Object form       {"tool":"<name>","arguments":{...}}
const P_TOOL = /\{\s*"?tool"?\s*:\s*"/;

function findEnvStart(text) {
  let best = -1;
  for (const re of [P_TOOL_CALL, P_TOOL_CALLS, P_TOOL]) {
    const m = re.exec(text);
    if (m && (best === -1 || m.index < best)) best = m.index;
  }
  return best;
}

function stripMarkers(text) {
  return typeof text === "string" ? text.replace(MARKERS, "") : "";
}

// Walker state for the envelope region: brace depth with string/escape awareness.
function isObjectClosed(envJSON) {
  let depth = 0, inStr = false, esc = false;
  for (let i = 0; i < envJSON.length; i++) {
    const c = envJSON[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") {
      depth--;
      if (depth === 0) return true;
    }
  }
  return false;
}

// NARROW repairs for the weak model's signature sloppiness. Must run BEFORE the
// depth lexer — a stray/unclosed quote otherwise opens a phantom string that
// swallows the [{" delimiters and breaks isObjectClosed entirely. Every repair
// is gated downstream: the result must parse AND every tool name must be in the
// offered set, else the raw text is passed through untouched.
//   1. bare identifier before an object in an array:  [webfetch{… or ,bash{… → {"name":"…",
//   2. bare key:value pair:   ,cmd:ls} → ,"cmd":"ls"  ({city:Tempe} → {"city":"Tempe"})
//   3. lone bare key next to structural:  {tool_call:[ → {"tool_call":[
//      (lookbehind blocks letters — i.e. inside quoted strings — while allowing
//      quote-preceded commas, which are the real repair targets)
//   4. missing opening quote on the FIRST key:  {tool_call":… → {"tool_call":…
//   5. quoted key fused to bare value:     "city:Tempe → "city":"Tempe
//   6. missing array-close: the weak model often drops the `]` of the tool_call
//      array (observed live: {"tool_call":[{"name":"bash","arguments":{...}}}
//      — 110 chars, brace depth bottoms at 1 so the lexer never sees a close).
//      Insert `]` before the final `}` ONLY when the string otherwise balances
//      with exactly one unclosed array (braceDepth 0, arrayDepth 1); anything
//      else (extra braces, truncated, both open) falls through to pass-through.
function repairStart(raw) {
  let out = raw;
  // --- step 6c FIRST: numeric option fused into the next key ("timeout:120000,workdir":"…") ---
  // Observed live: …,"command":"ls /tmp/x","timeout:120000,workdir":"/private/tmp/x"}}]}
  // (the model dropped `":120000,"` — timeout's closing quote AND the quote before
  // workdir). Split into "timeout":120000,"workdir":"…". MUST run before step 6 —
  // the key-fusion repair would otherwise corrupt "timeout:120000,workdir" into
  // "timeout":"120000,workdir" (it cannot tell the fused key from a quoted key).
  // Only fires for digit-only first value followed by a second key; gated by
  // parse+offered-name validation downstream.
  // flat-arguments form (observed live): "arguments":"ls /tmp/x",timeout:120000,
  // workdir:"/tmp" — the arguments value is a bare STRING and timeout/workdir are
  // siblings at the item level. Convert to the nested shape opencode expects.
  out = out.replace(/"arguments"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*(timeout)\s*:\s*(\d+)\s*,\s*(workdir)\s*:\s*"((?:[^"\\]|\\.)*)"/g, '"arguments":{"command":"$1","$2":$3,"$4":"$5"}');
  out = out.replace(/"([A-Za-z_][A-Za-z0-9_]*):(\d+),([A-Za-z_][A-Za-z0-9_]*)("\s*:\s*")/g, '"$1":$2,"$3":"');
  // ...and the fully-bare variant: "timeout:120000,workdir:/private/tmp/x (second
  // value unquoted too — the model free-mixes quoted head with DSL tail). Only for
  // digit-only first value + one more key:barevalue; gated downstream.
  out = out.replace(/"([A-Za-z_][A-Za-z0-9_]*):(\d+),([A-Za-z_][A-Za-z0-9_]*):([A-Za-z0-9_./\-]+)(?=[,\]}\s])/g, '"$1":$2,"$3":"$4"');
  // --- step 8 FIRST: unquoted key:value args-body recovery (observed live) ---
  // The weak model emits "arguments":{"command:echo X > /tmp/y,timeout:120000,workdir:/tmp}
  // — keys AND values unquoted; the whole arguments object is a comma-separated
  // key:value DSL. Recover by quoting each pair, values kept VERBATIM (that's
  // faithful transcription, not synthesis). Must run BEFORE the bare-key regexes
  // (they would corrupt "command:echo X …" into "command":"echo" broken-tail).
  // Tolerated stray quote pair wrapping the whole body ({"command:echo …,v:k"}).
  // Strict bail on any anomaly (remaining quotes/backslash, no colon, malformed
  // key → untouched).
  out = out.replace(/("arguments"\s*:\s*\{)([^{}]*?)(\})/g, (mm, pre, body, post) => {
    let bb = body;
    if (bb[0] === '"') bb = bb.slice(1);
    if (bb[bb.length - 1] === '"') bb = bb.slice(0, -1);
    if (/["'\\]/.test(bb) || bb.indexOf(":") < 0) return mm;
    const parts = bb.split(",");
    const pairs = [];
    for (let p = 0; p < parts.length; p++) {
      const idx = parts[p].indexOf(":");
      if (idx <= 0) return mm;
      const key = parts[p].slice(0, idx).trim().replace(/^"+/, "");
      const val = parts[p].slice(idx + 1).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_.\-]*$/.test(key)) return mm;
      pairs.push(JSON.stringify(key) + ":" + JSON.stringify(val));
    }
    return pre + pairs.join(",") + post;
  });
  out = out.replace(/([\[,{]\s*)([A-Za-z_][A-Za-z0-9_.\-]*)(\s*\{)/g, '$1{"name":"$2",');
  out = out.replace(/(?<!\w)([\[,{:]\s*)([A-Za-z_][A-Za-z0-9_.\-]*)(\s*:\s*)([A-Za-z_][A-Za-z0-9_.\-]*)(?=[\]},:])/g, '$1"$2"$3"$4"');
  out = out.replace(/(?<!\w)([\[,{:]\s*)([A-Za-z_][A-Za-z0-9_.\-]*)(\s*[\],}:])/g, '$1"$2"$3');
  out = out.replace(/^\{\s*([A-Za-z_][A-Za-z0-9_]*)"?\s*:/, '{"$1":');
  out = out.replace(/"([A-Za-z_][A-Za-z0-9_]*):([A-Za-z_][A-Za-z0-9_.\-]*)(?=[,\]}\s])/g, '"$1":"$2"');
  // --- step 6b: double-quote before a bareword value (""ls /path" → "ls /path") ---
  // Observed live: {"tool_call":[{"name":"bash","arguments":{"command":""ls /tmp/afm-agent-check",…}}]}
  // The model opened the value with TWO quotes. Value-position only (`:` before),
  // ≥1 non-quote char, closed by a quote followed by delimiters — empty strings
  // (no chars) and string interiors untouched.
  out = out.replace(/:\s*""([^"]+)"(?=[,\]}\s])/g, ':"$1"');
  // --- missing array-close repair (step 6) ---
  const t = out.trimEnd();
  if (t.endsWith("}")) {
    let bd = 0, ad = 0, inStr = false, esc = false;
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') { inStr = true; continue; }
      if (c === "{") bd++;
      else if (c === "}") bd--;
      else if (c === "[") ad++;
      else if (c === "]") ad--;
    }
    if (bd === 0 && ad === 1) out = t.slice(0, t.length - 1) + "]}";
  }
  // --- trailing-comma repair (step 7): the weak model emits ,}}] before the
  // closes (observed live: "command":"echo …marker.txt",}}]}). JSON.parse rejects
  // trailing commas. String-aware: only a `,` outside a string whose next
  // non-space char is } or ] is dropped — string interiors are never touched.
  {
    let res = "", inStr = false, esc = false;
    for (let i = 0; i < out.length; i++) {
      const c = out[i];
      if (inStr) {
        res += c;
        if (esc) esc = false;
        else if (c === "\\") esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') { inStr = true; res += c; continue; }
      if (c === ",") {
        let j = i + 1;
        while (j < out.length && /\s/.test(out[j])) j++;
        if (j < out.length && (out[j] === "}" || out[j] === "]")) continue;
      }
      res += c;
    }
    out = res;
  }
  return out;
}

// ── truncated-JSON completion (round-2 step 9) ──────────────────────────────
// The weak model cuts envelopes off mid-object or drops/swaps a closing
// delimiter (observed live: {"tool_call":[{"name":"bash","arguments":{...}}}
// missing the ]; ...html"]}]} — a `]` where `}` belonged). Rebalance the
// string, string-aware: on a mismatched closer, close the intervening open
// frames first and accept it (skip a stray closer when nothing is open);
// at the end append the missing closers in stack order (≤6). The result is
// ONLY honored when it parses AND every tool name matches the offered set
// (validated in toCalls downstream) — never half-synthesized. Returns null
// when the string is balanced-and-unchanged, over MAX_ENV, or unrestorable.
function completeEnvelope(raw) {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_ENV) return null;
  const s = repairStart(raw);
  if (s.length > MAX_ENV) return null;
  let out = "", stack = [], inStr = false, esc = false, changed = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      out += c;
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; out += c; continue; }
    if (c === "{" || c === "[") { stack.push(c === "{" ? "}" : "]"); out += c; continue; }
    if (c === "}" || c === "]") {
      if (stack.length === 0) { changed = true; continue; }      // stray closer → drop
      const top = stack[stack.length - 1];
      if (top === c) { stack.pop(); out += c; continue; }
      const idx = stack.lastIndexOf(c);                          // matches an open frame
      if (idx !== -1) {
        out += stack.slice(idx + 1).join("") + c;                // close frames above it, then accept
        stack = stack.slice(0, idx);
        changed = true;
        continue;
      }
      changed = true;                                            // truly stray → drop
      continue;
    }
    out += c;
  }
  if (stack.length === 0) return changed ? out : null;
  if (stack.length > 6) return null;
  out += stack.reverse().join("");       // LIFO: last-opened frame closes first
  return out;
}

// Strict parse first; on failure attempt a NARROW, deterministic repair for the
// token-level sloppiness the weak model exhibits (observed live): a missing
// opening quote on the envelope's first key and unquoted bare scalar values
// ("city":Tempe). Repair is gated: only when the raw region looks like an
// envelope object; correctness is still guaranteed downstream by the strict
// offered-name check in toCalls — nothing half-synthesized.
function tryParse(raw) {
  if (typeof raw !== "string") return null;
  let obj = null;
  try { obj = JSON.parse(raw); } catch { /* fall through to repair */ }
  if (obj) return obj;
  if (raw.length === 0 || raw.length > MAX_ENV) return null;
  let out = raw.trim();
  if (!out.startsWith("{")) return null;
  out = repairStart(out);
  // Gate the value-repair: only when the repairStart output STILL fails to parse.
  // Running it unconditionally corrupts valid numeric values ("timeout":120000 →
  // "timeout":"120000) because it cannot tell a quoted-key+bare-value corruption
  // ("city":Tempe) from a legitimate quoted-key+numeric-value pair.
  try { return JSON.parse(out); } catch { /* keep repairing */ }
  out = out.replace(
    /("\s*(?:"(?:\\.|[^"\\])*"|[A-Za-z_][A-Za-z0-9_]*)"?\s*:)\s*([A-Za-z_][A-Za-z0-9_.\-]*)(?=[,\]}\s])/g,
    '$1"$2"'
  );
  try { return JSON.parse(out); } catch { return null; }
}

// Strip a surrounding ```json fence (open and close) from an envelope region.
function stripFence(s) {
  let out = s.trim();
  out = out.replace(/^```[a-zA-Z]*\s*/, "");
  out = out.replace(/```\s*$/, "");
  return out.trim();
}

// Normalize any tolerated envelope object into [{name, arguments}] or null.
// STRICT: every call name must be a tool offered in THIS request.
// Weak-model tolerance: call args may be inlined as SIBLING KEYS of the array
// item, e.g. {"name":"webfetch","url":"..."} instead of the contracted
// {"name":"webfetch","arguments":{"url":"..."}} — sibling keys are collected
// into the arguments object (reserved keys excluded) rather than half-synthesizing.
function toCalls(raw, offered) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  let items = null;
  if (Array.isArray(raw.tool_call)) items = raw.tool_call;                 // native array
  else if (Array.isArray(raw.tool_calls)) items = raw.tool_calls;          // openai array
  else if (typeof raw.tool_call === "string")
    items = [{ ...raw, name: raw.tool_call }];                             // string form
  else if (typeof raw.tool === "string")
    items = [{ ...raw, name: raw.tool }];                                  // {"tool":...}
  else return null;
  const RESERVED = new Set(["name", "type", "id", "index", "function", "arguments"]);
  const calls = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    // --- string-element form (observed live): "tool_call": ["bash", {"command":"ls",...}]
    // a bare tool name string, optionally followed by a sibling args object
    if (typeof it === "string") {
      const name = it;
      let args = null;
      const nxt = items[i + 1];
      if (nxt && typeof nxt === "object" && !Array.isArray(nxt) && !("name" in nxt) && !("arguments" in nxt) && !("function" in nxt)) {
        args = nxt;
        i++; // consume the sibling args object
      }
      calls.push({ name, arguments: args && typeof args === "object" ? args : {} });
      continue;
    }
    if (!it || typeof it !== "object") return null;
    const name = typeof it.name === "string"
      ? it.name
      : it.function && typeof it.function.name === "string" ? it.function.name : null;
    if (!name) return null;
    let args = it.arguments;
    if (args == null) args = it.function && it.function.arguments;
    if (typeof args === "string") { try { args = JSON.parse(args); } catch { args = null; } }
    if (!args || typeof args !== "object" || Array.isArray(args)) {
      args = {};
      // flat-arguments fallback: a non-JSON string arguments is the COMMAND
      const flatCmd = typeof it.arguments === "string" && it.arguments.trim()
        ? it.arguments.trim()
        : it.function && typeof it.function.arguments === "string" && it.function.arguments.trim()
          ? it.function.arguments.trim() : null;
      if (flatCmd) args.command = flatCmd;
      for (const k of Object.keys(it)) {
        if (RESERVED.has(k)) continue;
        const v = it[k];
        if (v !== undefined) args[k] = v;
      }
    }
    calls.push({ name, arguments: args });
  }
  if (!calls.length) return null;
  for (const c of calls) if (!offered.has(c.name)) return null; // EVERY name must be offered
  return calls;
}

// Index of the depth-0 closing brace of an envelope region, computed on the
// REPAIRED string (the raw string's stray quotes mislead the lexer).
function repairedCloseIndex(raw) {
  let depth = 0, inStr = false, esc = false;
  const s = repairStart(raw);
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') { inStr = true; continue; }
    if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") { depth--; if (depth === 0) return i; }
  }
  return -1;
}

// Shared end-of-object final-position check: after the closing brace only
// whitespace and an optional closing fence may follow.
// (Note: head-anchored — works because the envelope region starts at the
// envelope's own `{`.)
function finalPositionOk(text, endIdx) {
  const tail = text.slice(endIdx + 1).replace(/```/g, "");
  return tail.trim() === "";
}

function cid() { return "call_" + Math.random().toString(36).slice(2, 12); }

// ── HTTP plumbing ────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, cors());
    res.end();
    return;
  }
  const isChat = !!(req.url && req.url.includes("/chat/completions"));
  if (!isChat) { pipeRaw(req, res); return; }

  req.setEncoding("utf8");
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    let parsed = null;
    try { parsed = JSON.parse(body); } catch { /* relay raw */ }
    if (!parsed || typeof parsed !== "object") {
      pipeRaw(req, res, body);
      return;
    }
    // Only inject the envelope instruction when tools are actually offered —
    // with an empty tool set (e.g. opencode's title-generation stream) the
    // bridge would only coax the model into emitting garbage envelopes that
    // get shown to the user as text.
    const offeredReq = new Set(
      (Array.isArray(parsed.tools) ? parsed.tools : [])
        .map((t) => (t && t.function && t.function.name) || null).filter(Boolean)
    );
    const forwardBody = offeredReq.size > 0 ? injectInstruction(parsed, offeredReq) : body;
    const upstreamHeaders = { ...req.headers, "content-length": Buffer.byteLength(forwardBody) };
    delete upstreamHeaders.host;
    delete upstreamHeaders["transfer-encoding"];

    const proxyReq = http.request(
      { hostname: UP.hostname, port: UP.port || 80, path: req.url, method: req.method, headers: upstreamHeaders },
      (proxyRes) => {
        if (parsed.stream) handleStream(res, proxyReq, proxyRes, parsed, forwardBody);
        else handleNonStream(res, proxyReq, proxyRes, parsed);
      }
    );
    proxyReq.on("error", (e) => {
      if (res.destroyed || res.writableEnded) return;
      res.writeHead(502, { "content-type": "application/json", ...cors() });
      res.end(JSON.stringify({ error: { message: `upstream unreachable: ${e.message}`, type: "server_error", code: "upstream_unreachable" } }));
    });
    res.on("close", () => proxyReq.destroy());
    proxyReq.write(forwardBody);
    proxyReq.end();
  });
});

function cors() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "Authorization, *",
  };
}

function pipeRaw(req, res, preBody) {
  const headers = { ...req.headers };
  delete headers.host;
  delete headers["transfer-encoding"];
  if (preBody != null) headers["content-length"] = Buffer.byteLength(preBody);
  const proxyReq = http.request(
    { hostname: UP.hostname, port: UP.port || 80, path: req.url, method: req.method, headers },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode, { ...proxyRes.headers, ...cors() });
      proxyRes.pipe(res);
    }
  );
  proxyReq.on("error", () => { if (!res.destroyed) res.end(); });
  req.pipe(proxyReq);
  if (preBody != null) proxyReq.write(preBody);
}

// Append the envelope instruction after the last system/developer message —
// but ONLY when the conversation ends in a user turn. After a tool result the
// model must answer in plain text; re-injecting the instruction there makes the
// 3B model loop: call tool → read result → call tool again → degenerate junk.
function injectInstruction(parsed, offeredNames) {
  const msgs = Array.isArray(parsed.messages) ? parsed.messages : [];
  const last = msgs.length ? msgs[msgs.length - 1] : null;
  if (!last || last.role !== "user") return JSON.stringify(parsed);
  // Lever B — directory/file-intent directive appended to the USER message itself
  // (not the global instruction): conservative regex, exact-directory-intent only,
  // and only when the previous turn didn't already attempt an envelope (i.e. the
  // last-but-one message is NOT an assistant tool call we answered with a result).
  const prev = msgs.length > 1 ? msgs[msgs.length - 2] : null;
  const prevAttemptedEnvelope =
    prev && // assistant answered a tool result → already attempted
    ((prev.role === "assistant" && Array.isArray(prev.tool_calls) && prev.tool_calls.length) ||
     (prev.role === "assistant" && typeof prev.content === "string" && /"tool_call"\s*:/.test(prev.content)));
  const userText = (typeof last.content === "string" ? last.content : "").trim();
  const dirIntent = /\b(list|show|what)\b[\s\S]{0,40}?\b(in|files|contents|directory)\b|\bls\b/i;
  const dirHint = /\/|~|\b(current|here|directory|folder|this dir)\b/i;
  if (
    !prevAttemptedEnvelope &&
    dirIntent.test(userText) &&
    dirHint.test(userText)
  ) {
    // Substitute the REAL path from the user message into the example — the weak
    // model copies `<path>` verbatim (T2-2: ran `ls <path>` literally) whenever
    // the placeholder stays generic.
    const pathMatch = userText.match(/\/[^\s"']+/);
    const examplePath = pathMatch ? pathMatch[0].replace(/[?.,;!:'")]+$/, "") : "<path>";
    last.content +=
      "\n\nTo answer this, first emit exactly: " +
      `{"tool_call":[{"name":"bash","arguments":{"command":"ls ${examplePath}"}}]}, nothing before it.`;
  }
  // Lever B-bis — explicit run-command intent ("Use bash to run: echo X > f"):
  // append a concrete envelope with the REAL command substituted. The weak model
  // otherwise falls back to narrating a fenced bash block (its training prior).
  const runIntent = /\b(use\s+bash|run|execute)\b/i;
  if (!prevAttemptedEnvelope && runIntent.test(userText)) {
    const cmdMatch = userText.match(/[:\-–]\s*([^\n]{1,200})$/);
    const exampleCmd = cmdMatch ? cmdMatch[1].trim().replace(/["`]/g, "") : "<the exact command>";
    last.content +=
      "\n\nTo execute a shell command, first emit exactly, never a code block: " +
      `{"tool_call":[{"name":"bash","arguments":{"command":"${exampleCmd}"}}]}, nothing after it.`;
  }
  let lastSys = -1;
  msgs.forEach((m, i) => { if (m && (m.role === "system" || m.role === "developer")) lastSys = i; });
  const names = offeredNames ? [...offeredNames] : [];
  const purposes = names.map((n) => `${n} = ${TOOL_PURPOSES[n] || "an offered tool"}`).join("; ");
  const instr = {
    role: "system",
    content: INSTRUCTION +
      (purposes ? ` Tool purposes: ${purposes}.` : "") +
      (names.length ? ` Offered tools: ${names.join(", ")}.` : ""),
  };
  if (lastSys >= 0) msgs.splice(lastSys + 1, 0, instr);
  else msgs.unshift(instr);
  parsed.messages = msgs;
  return JSON.stringify(parsed);
}

function log(line) { console.error(`[tool-voice] ${line}`); }

// ── Streaming relay ──────────────────────────────────────────────────────────
function handleStream(res, proxyReq, proxyRes, parsed, forwardBody) {
  const offered = new Set(
    (Array.isArray(parsed.tools) ? parsed.tools : [])
      .map((t) => (t && t.function && t.function.name) || null).filter(Boolean)
  );
  log(`req tools=${[...offered].join(",") || "(none)"} stream=1 keys=${Object.keys(parsed).join(",")} tc=${JSON.stringify(parsed.tool_choice)}`);

  let st = "text";            // text | envelope | (passthru implied by modes below)
  let buf = "";               // marker-stripped un-emitted content, text mode
  let envJSON = "";           // envelope region content
  let envClosed = false;      // parse succeeded at final position (pending stream end)
  let closedAt = -1;          // index in envJSON where the envelope object closed
  let env = null;             // normalized calls
  let invalid = false;        // envelope rejected → pass through everything
  let sawUpstreamCalls = false; // fm-proxy already gave us real tool_calls
  let sawDone = false;
  let abort = false;          // upstream typed error frame seen
  let finishChunk = null;     // held upstream finish chunk (parsed)
  let usageChunk = null;      // held usage-only chunk (parsed)
  let lastMeta = { id: "chatcmpl-voice", object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model: (parsed && parsed.model) || "system" };
  let finalized = false;

  const sendDelta = (delta, extra) => {
    res.write("data: " + JSON.stringify({ ...lastMeta, choices: [{ index: 0, delta, ...(extra || {}) }] }) + "\n\n");
  };

  // Re-emit an already-parsed upstream frame with OUR canonical SSE framing.
  // NEVER relay upstream lines verbatim: fm-proxy terminates events with a
  // single "\n" and the AI SDK parser merges adjacent bare lines into one
  // invalid JSON event (observed: AI_JSONParseError "Unable to parse JSON").
  const emitFrame = (obj) => {
    res.write("data: " + JSON.stringify(obj) + "\n\n");
  };

  // Envelope-mode incremental walk: append then re-scan (region is bounded ≤ MAX_ENV).
  function walkEnv() {
    if (invalid || envClosed) return;
    if (envJSON.length > MAX_ENV) { invalid = true; return; }
    // Repair the (possibly unquoted/misquoted) first key region BEFORE the
    // depth lexer — a stray/unclosed quote would otherwise open a phantom
    // string that swallows the [{" delimiters (observed live).
    if (!isObjectClosed(repairStart(envJSON))) return;
    let obj = null;
    const cand = stripFence(envJSON);
    obj = tryParse(cand);
    if (!obj) { invalid = true; return; }
    const calls = toCalls(obj, offered);
    if (!calls || !finalPositionOk(envJSON, envJSON.length - 1)) { invalid = true; return; }
    env = calls;
    envClosed = true;
    // The object itself closed at the last balanced brace; find where — on the
    // REPAIRED string (the raw string's stray quotes mislead a direct scan).
    closedAt = repairedCloseIndex(envJSON);
  }

  // After a valid envelope closes, nothing but whitespace / a closing fence may follow.
  function checkTrailing() {
    if (envClosed && !invalid) {
      const probe = repairStart(envJSON);
      if (probe.slice(closedAt + 1).replace(/```/g, "").trim() !== "") {
        invalid = true;
      }
    }
  }

  function onContent(raw) {
    if (abort || sawUpstreamCalls) return;
    const clean = stripMarkers(raw);
    if (!clean) return;
    if (st === "text") {
      buf += clean;
      const k = findEnvStart(buf);
      if (k === -1) {
        if (buf.includes("tool_call") && buf.length > 24) log(`DBG nomatch buf=${JSON.stringify(buf.slice(0, 120))}`);
        const keep = Math.min(TXT_TAIL, buf.length);
        const emit = buf.slice(0, buf.length - keep);
        buf = buf.slice(buf.length - keep);
        if (emit) sendDelta({ content: emit });
        return;
      }
      // Envelope found at k. Fold in a preceding ```json fence line if it is the
      // only thing between the fence and the envelope (keeps prose clean).
      const pre = buf.slice(0, k);
      let startIdx = k;
      const fenceM = pre.replace(/\s+$/, "").match(/(```)\s*(json)?\s*$/);
      if (fenceM) {
        const openIdx = pre.lastIndexOf("```");
        if (/^\s*(json)?\s*$/.test(pre.slice(openIdx + 3))) startIdx = openIdx;
      }
      if (startIdx === k) {
        const prose = buf.slice(0, k);
        if (prose) sendDelta({ content: prose });
      }
      envJSON = buf.slice(startIdx);
      buf = "";
      st = "envelope";
      walkEnv();
      checkTrailing();
      return;
    }
    // envelope mode
    envJSON += clean;
    walkEnv();
    checkTrailing();
  }

  function synthesize() {
    if (!env || !env.length || !envClosed || invalid || abort || sawUpstreamCalls) return false;
    sendDelta({ role: "assistant" });
    env.forEach((c, i) => {
      sendDelta({ tool_calls: [{ index: i, id: cid(), type: "function", function: { name: c.name, arguments: "" } }] });
      const args = JSON.stringify(c.arguments);
      for (let p = 0; p < args.length; p += ARG_CHUNK) {
        sendDelta({ tool_calls: [{ index: i, function: { arguments: args.slice(p, p + ARG_CHUNK) } }] });
      }
    });
    return true;
  }

  function emitFinish(synthesized) {
    if (finishChunk) {
      const fc = JSON.parse(JSON.stringify(finishChunk)); // copy
      if (synthesized) {
        fc.choices = [{ index: 0, delta: {}, finish_reason: "tool_calls" }];
      }
      res.write("data: " + JSON.stringify(fc) + "\n\n");
    } else {
      const fc = { ...lastMeta, choices: [{ index: 0, delta: {}, finish_reason: synthesized ? "tool_calls" : "stop" }] };
      if (usageChunk && usageChunk.usage) fc.usage = usageChunk.usage;
      res.write("data: " + JSON.stringify(fc) + "\n\n");
    }
  }

  function finalize() {
    if (finalized) return;
    finalized = true;
    // Stream ended with an unclosed/unparseable envelope → last chance: truncated-JSON
    // completion (only here, never mid-stream — the envelope may still be typing).
    if (st === "envelope" && !envClosed) {
      const completed = completeEnvelope(envJSON);
      const obj = completed ? tryParse(completed) : null;
      const calls = obj ? toCalls(obj, offered) : null;
      if (calls && finalPositionOk(completed, completed.length - 1)) {
        env = calls;
        invalid = false;          // completion supersedes the earlier failed parse
        envClosed = true;
        closedAt = completed.length - 1;
      } else {
        invalid = true;
      }
    }
    const synthesized = synthesize();
    const tailRaw = st === "envelope" ? envJSON : buf;
    log(`envelope=${synthesized ? "hit" : (envClosed || invalid ? "invalid" : "miss")} calls=${synthesized ? env.length : 0} finish=${synthesized ? "tool_calls" : "verbatim"} rawlen=${buf.length}/${envJSON.length} tail=${JSON.stringify(tailRaw.slice(-80))}`);
    if (!synthesized) {
      // STRIP-on-invalid: a call-like remainder (this proxy only enters envelope
      // mode when a tool_call/tool_calls/tool object started) is NEVER relayed —
      // the pre-envelope prose was already emitted live, so the user gets clean
      // truncated prose instead of raw JSON garbage. Non-call text passes through.
      if (st === "text" && buf) sendDelta({ content: buf });
    }
    emitFinish(synthesized);
    // Always send our own [DONE] terminator (upstream's is consumed, not relayed).
    res.write("data: [DONE]\n\n");
    if (!res.destroyed) res.end();
  }

  proxyRes.setEncoding("utf8");
  let pending = "";
  proxyRes.on("data", (chunk) => {
    pending += chunk;
    let idx;
    while ((idx = pending.indexOf("\n")) !== -1) {
      const line = pending.slice(0, idx + 1);
      pending = pending.slice(idx + 1);
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const payload = t.slice(5).trim();
      if (payload === "[DONE]") { sawDone = true; finalize(); continue; }
      let obj = null;
      try { obj = JSON.parse(payload); } catch { continue; }
      if (obj.error && !(obj.choices && obj.choices.length)) {
        // Typed error frame (fm-proxy already classified it) — relay, no synthesis.
        abort = true;
        emitFrame(obj);
        continue;
      }
      if (obj.choices && obj.choices.length) {
        lastMeta = { id: obj.id || lastMeta.id, object: obj.object || lastMeta.object, created: obj.created || lastMeta.created, model: obj.model || lastMeta.model };
        const ch0 = obj.choices[0];
        if (ch0.finish_reason) { finishChunk = obj; continue; }
        const delta = ch0.delta;
        if (delta && typeof delta.content === "string") { onContent(delta.content); continue; }
        if (delta && Array.isArray(delta.tool_calls)) { sawUpstreamCalls = true; emitFrame(obj); continue; }
        // role preamble and anything else → relay with canonical framing
        emitFrame(obj);
      } else if (obj.usage) {
        usageChunk = obj;
        // never relay mid-stream; the final chunk carries usage
      } else {
        emitFrame(obj);
      }
    }
  });
  proxyRes.on("end", () => { finalize(); });
  proxyRes.on("error", () => { if (!finalized) finalize(); });
}

// ── Non-streaming relay ──────────────────────────────────────────────────────
function handleNonStream(res, proxyReq, proxyRes, parsed) {
  const offered = new Set(
    (Array.isArray(parsed.tools) ? parsed.tools : [])
      .map((t) => (t && t.function && t.function.name) || null).filter(Boolean)
  );
  let raw = "";
  proxyRes.setEncoding("utf8");
  proxyRes.on("data", (c) => (raw += c));
  proxyRes.on("end", () => {
    let obj = null;
    try { obj = JSON.parse(raw); } catch { /* relay as-is */ }
    if (obj && !(obj.error && !(obj.choices && obj.choices.length))) {
      const msg = obj.choices && obj.choices[0] && obj.choices[0].message;
      if (msg && !msg.tool_calls && typeof msg.content === "string") {
        const clean = stripMarkers(msg.content);
        const k = findEnvStart(clean);
        if (k !== -1) {
          // Repair the first key before the depth scan (same phantom-string trap
          // as the stream path); endIdx is relative to the repaired region.
          const region = repairStart(clean.slice(k));
          let depth = 0, inStr = false, esc = false, endIdx = -1;
          for (let i = 0; i < region.length; i++) {
            const c = region[i];
            if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
            if (c === '"') { inStr = true; continue; }
            if (c === "{" || c === "[") depth++;
            else if (c === "}" || c === "]") { depth--; if (depth === 0) { endIdx = i; break; } }
          }
          const pre = clean.slice(0, k).replace(/(```)\s*[a-zA-Z]*\s*$/, "");
          let stripped = false;
          if (endIdx !== -1 && finalPositionOk(region, endIdx)) {
            let obj2 = tryParse(stripFence(region.slice(0, endIdx + 1)));
            const calls = obj2 ? toCalls(obj2, offered) : null;
            if (calls) {
              msg.tool_calls = calls.map((c) => ({
                id: cid(), type: "function", function: { name: c.name, arguments: JSON.stringify(c.arguments) },
              }));
              msg.content = stripMarkers(pre) || null;
              obj.choices[0].finish_reason = "tool_calls";
              log(`envelope=hit calls=${calls.length} mode=sync`);
              stripped = true;
            }
          }
          if (!stripped) {
            // Truncated-JSON completion (mirror of the stream path).
            const completed = completeEnvelope(clean.slice(k));
            const obj3 = completed ? tryParse(completed) : null;
            const calls3 = obj3 ? toCalls(obj3, offered) : null;
            if (calls3 && finalPositionOk(completed, completed.length - 1)) {
              msg.tool_calls = calls3.map((c) => ({
                id: cid(), type: "function", function: { name: c.name, arguments: JSON.stringify(c.arguments) },
              }));
              msg.content = stripMarkers(pre) || null;
              obj.choices[0].finish_reason = "tool_calls";
              log(`envelope=hit calls=${calls3.length} mode=sync-completed`);
              stripped = true;
            }
          }
          if (!stripped) {
            // STRIP-on-invalid: never show raw JSON garbage — drop the call-like
            // remainder, keep the pre-envelope prose.
            msg.content = stripMarkers(pre) || null;
            log(`envelope=invalid mode=sync-strip`);
          }
        }
      }
    }
    if (!res.destroyed) {
      const out = obj ? JSON.stringify(obj) : raw;
      res.writeHead(proxyRes.statusCode, { ...proxyRes.headers, ...cors(), "content-length": Buffer.byteLength(out) });
      res.end(out);
    }
  });
  proxyRes.on("error", () => { if (!res.destroyed) res.end(); });
}

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`tool-voice-proxy listening on http://127.0.0.1:${PORT}`);
    console.log(`  forwarding to ${UPSTREAM}`);
  });
}