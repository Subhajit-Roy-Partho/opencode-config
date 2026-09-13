# tool-voice-proxy

Bridges Apple's on-device Foundation Model (`fm serve`) into **real OpenAI `tool_calls`**
for opencode by translating the model's *narrated* JSON call envelopes.

fm serve's 3B model never populates `tool_calls` on `tool_choice: "auto"` — it writes the
call into `content` instead (native form `{"tool_call":[{"name":"...","arguments":{...}}]}`).
This proxy injects a compact system instruction, detects the envelope in the streamed
text, strips it, and re-emits it as OpenAI `tool_calls` deltas with
`finish_reason: "tool_calls"` so opencode **executes** the call — bash, webfetch, MCP
weather, anything the agent offers.

## Topology

```
opencode ──▶ :1981 tool-voice-proxy ──▶ :1977 fm-proxy ──▶ :1976 fm serve
              (this repo)               (sanitizes schemas,   (Apple 3B model)
                                        retries, types errors)
```

`fm-proxy` upstream is required: it already flattens tool schemas (no
`contains undefined references`), types errors, retries transient failures and relays
real usage. This proxy only adds the instruction + envelope translation.

## Run

```bash
nohup node tool-voice-proxy.js >/tmp/tool-voice.log 2>&1 &
node --check tool-voice-proxy.js   # syntax check
```

| Env var | Default | Effect |
|---|---|---|
| `PORT` | `1981` | Listen port |
| `UPSTREAM` | `http://127.0.0.1:1977/v1` | fm-proxy base URL |

Health: `curl -s http://127.0.0.1:1981/v1/models` (piped through to fm-proxy).
Syntax check with `node --check tool-voice-proxy.js`.

## Envelope contract

Injected system instruction (appended after the last system/developer message, unshifted
if none, on tool-bearing requests only — title-gen streams get no instruction; ~50 tokens):

> End your reply with exactly one JSON object, nothing after it, no code fences:
> `{"tool_call":[{"name":"tool-name","arguments":{"parameter":"value"}}]}`. Call a tool
> only when truly needed; otherwise answer in plain text.

Only a JSON object at **final position** (nothing but whitespace / a closing
```` ``` ```` fence after it) is honored, and only when **every** tool name matches a
tool actually offered in **this** request. Otherwise the text passes through untouched —
the proxy never half-synthesizes.

### Tolerated variants (accepted at final position, same strict validation)

| Pattern | Example |
|---|---|
| Native array (primary) | `{"tool_call": [{"name": "bash", "arguments": {"command": "ls"}}]}` |
| `tool_calls` array | `{"tool_calls": [{"name": "bash", "arguments": {...}}]}` |
| Fenced block (either form) | ```` ```json {"tool_call":[...]} ``` ```` |
| Object string form | `{"tool_call": "bash", "arguments": {...}}` |
| `tool` key form | `{"tool": "bash", "arguments": {...}}` |
| String array element + sibling args | `{"tool_call": ["bash", {"command": "ls -la"}]}` |
| Bare-token repairs (weak-model sloppiness) | `{tool_call:[weather_get_temperature{city:Tempe}]}`, `"command:echo X,timeout:120000,workdir:/tmp` DSL, trailing comma, missing `]` |

Arguments may be an object (`{"city":"Tempe"}`), a JSON string (`"{\"city\":\"Tempe\"}"`),
or sibling keys; all are parsed and re-serialized compactly before being streamed as
`function.arguments` in ≤64-char pieces (same shape as fm-proxy's `emitSynthesisedStream`).

### Repair pipeline (repairStart, 8 deterministic steps)

The 3B model hovers between valid JSON and corrupted variants; each repair is **gated** —
result must `JSON.parse` AND every tool name must be in the offered set, else raw text
passes through untouched:

1. Step 8 (runs FIRST): unquoted `key:value` args-body DSL — `"arguments":{"command:echo X > /tmp/y,timeout:120000,workdir:/tmp}` → quote each pair verbatim (values preserved byte-for-byte; a stray wrapping quote pair is tolerated; anything else → untouched).
2. Bare identifier before object: `[webfetch{` / `,bash{` → `{"name":"…",`
3. Bare key:value pair: `,cmd:ls}` → `,"cmd":"ls"`
4. Lone bare key: `{tool_call:[` → `{"tool_call":[`
5. Missing opening quote on first key: `{tool_call":…` → `{"tool_call":…`
6. Quoted key fused to bare value: `"city:Tempe` → `"city":"Tempe`
7. Missing array-close: `…"command":"…"}}` (drops the `]`) → `…}}]}`
8. Trailing comma: `…marker.txt",}}]}` → `…marker.txt"}}]}` (string-aware — never touches string interiors)

## What passes through untouched

- replies with no envelope (plain text),
- upstream typed error frames (`fm-proxy` classifies them),
- guardrail aborts (`finish_reason: "content_filter"`),
- real `tool_calls` deltas (e.g. from fm-proxy's forced-dispatch path),
- malformed / truncated / non-matching envelopes (relayed as plain text).

## Verification battery

Scratch dir with known files, then run each command from it:

```bash
mkdir -p /tmp/afm-agent-check && cd /tmp/afm-agent-check
echo a > alpha.txt && echo b > beta.txt && echo '{"k":1}' > beta.json
```

| # | Command | Expected |
|---|---|---|
| 1 | `opencode run --agent afm-agent "What is the temperature in Tempe right now?"` | REAL `weather_get_temperature` call (envelope translated), real temp in reply. |
| 2 | `opencode run --agent afm-agent "List the files in /tmp/afm-agent-check."` | REAL `ls` runs; reply names exactly `alpha.txt, beta.json, beta.txt`. |
| 3 | `opencode run --agent afm-agent "Use bash to run: echo EXECMARKER-777 > /tmp/afm-agent-check/marker.txt"` | `cat /tmp/afm-agent-check/marker.txt` prints `EXECMARKER-777`. |
| 4 | `opencode run --agent afm-agent "What is 2 + 2?"` | Clean text answer, no spurious envelope. |
| 5 | Hit rate | Repeat #1 or #3 three times; count `envelope=hit` in `/tmp/tool-voice.log`. |

Evidence in `/tmp/tool-voice.log`: `[tool-voice] envelope=hit|invalid|miss calls=N`.

## Config wiring (opencode.jsonc)

```jsonc
"apple": {
  "options": { "baseURL": "http://127.0.0.1:1981/v1" },   // was :1977
  "models": { "system": { /* NO "tool_call": false — that strips tools */ } }
}
"afm-agent": {
  "mode": "primary",
  "model": "apple/system",
  "tools": { "bash": true, "webfetch": true, "weather_get_temperature": true, "*": false }
}
```

CRITICAL: `tool_call: false` on the model entry strips tools from every request — the
whole point is that tools are offered so the model can emit an envelope.

## Known limits

- **Empirical hit rate (3B fm model, measured 2026-09-13):** `weather_get_temperature`
  (Tempe) consistently produced real tool calls (~4/4); `bash` execution (EXECMARKER
  side-effect) landed 3/6 main-stream attempts with a real file created on the hits;
  `ls` file-listing and `2 + 2` frequently degraded to **narrated** bash (fenced code,
  no envelope) or a spurious/malformed `webfetch` envelope — pass-through showed the raw
  JSON instead of a clean text answer. The 3B model's *voluntary* envelope emission is
  the make-or-break factor; a prose escape always wins with this model family (fm-proxy
  AGENTS.md: auto 0/25 with an escape). The injection forbids the escape and
  final-position enforcement rejects explain-then-call narratives, but the hit rate is
  an empirical question and **varies by task** — weather-type calls are much more
  reliable than bash.
- 4096-token context window: opencode's default orchestrator overflows; `afm-agent` uses
  a lean toolset. Overflow surfaces as typed `context_length_exceeded` from fm-proxy.
- Assistant `tool_calls` history is flattened to `""` content by fm-proxy's
  `splitMessages`, so follow-up turns see tool results but not tool names.
- T4 (2+2) is the known-weak case: the model invents `webfetch` for math and often
  emits broken JSON (`"]}]}`) that correctly fails validation → raw text passes through.