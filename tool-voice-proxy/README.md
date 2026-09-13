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
> `{"tool_call":[{"name":"tool-name","arguments":{"parameter":"value"}}]}`.
> For live data (weather, time, files, directories, internet) you MUST emit the
> envelope calling the best-fitting tool. Never fake, guess, or show code-fence
> commands — emit the envelope or answer plainly. For simple facts you already know
> (e.g. basic arithmetic), answer in plain text; never call a tool.
>
> A per-tool purposes hint follows for the tools actually offered in the request:
> `bash = running shell/file commands (ls, cat, echo, curl)`, `webfetch = fetching a
> specific web page or URL`, `weather_get_temperature = live weather for a city`.
> Full injection ≈ 95–110 tokens.

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
9. **Truncated-JSON completion** (stream end only): rebalance the region string-aware on a
   mismatched closer — close the intervening open frames, drop stray closers, and append
   the missing closers (≤6) in LIFO order. Fixes both `…html"]}]}` (a `]` where `}`
   belonged — the round-1 2+2 shape) and envelopes cut mid-string. Gated by the same
   parse + offered-name validation.

### STRIP-on-invalid

When the stream ends call-like (`tool_call`/`tool_calls`/`tool` object was detected at
any point) but every repair fails, the remainder is **dropped** from the relayed text —
the pre-envelope prose was already emitted live, so the user gets clean truncated prose
and never sees raw JSON garbage. Non-call text passes through untouched. (Round-2
measured: `envelope=invalid` relays = 0.)

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

- **Empirical hit rate (3B fm model, round-3 measured 2026-09-13, injection v3 + step-9
  completion + STRIP + Lever-B user-message directives):**
  - weather: **4/4** real calls (real 86°F Tempe data from the weather MCP).
  - file-listing (`List the files in <path>` / `What is in <path>?` / `List files in the
    current directory`): **3/3 — was 0/3 in round 2.** The fix was two-fold: (a) the global
    instruction's forced directory example (140 chars with `timeout`/`workdir`) was too
    long for the 3B to reproduce — it free-mixed shapes (`"arguments":"ls …"` string,
    `"command":"ls "/…,timeout:120000,workdir:"…`, `ls <path>/realpath`, trailing `?`) for
    9+ distinct variants. Solution: removed the example from the global instruction and
    moved it to a **Lever-B per-request directive appended to the user message itself**,
    fired only on conservative directory-intent regex
    (`\b(list|show|what)\b … \b(in|files|contents|directory)\b` + a path hint), with the
    REAL path from the user message substituted into the example. The model copies the
    concrete example faithfully (T2-1 `ls /private/tmp/afm-agent-check`, T2-2
    `ls /tmp/afm-agent-check`, T2-3 resolved cwd itself → `ls /private/tmp/afm-agent-check`);
    - bash EXECMARKER side-effect: **2/2** this round (marker.txt = EXECMARKER-777 real);
      the generic instruction alone regressed T3 to fenced narration, so a Lever-B-bis
      run-command directive (`\b(use\s+bash|run|execute)\b`) with the real command
      substituted fixed it — proof only the envelope is needed, the 3B executes when the
      example is concrete.
  - 2+2 → clean `4` with zero envelopes (the NO-TOOL rule + keeping the directory example
    OUT of the global instruction prevents spurious `ls <path>` envelopes on math).
  - `envelope=invalid` relays = 0 (STRIP + narrow repairs); 14 tool-bearing requests in
    the final daemon session → 4 envelope=hit, 0 invalid, rest plain follow-ups.
- 4096-token context window: opencode's default orchestrator overflows; `afm-agent` uses
  a lean toolset. Overflow surfaces as typed `context_length_exceeded` from fm-proxy.
- Assistant `tool_calls` history is flattened to `""` content by fm-proxy's
  `splitMessages`, so follow-up turns see tool results but not tool names.