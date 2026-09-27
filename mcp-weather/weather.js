#!/usr/bin/env node
// Minimal stdio MCP server: live temperature via wttr.in (no dependencies).
// Kept to ONE tool with ONE string param so the schema survives fm-serve.
const readline = require("readline");

const TOOL = {
  name: "get_temperature",
  description: "Get the current temperature and conditions for a city. Call this for any weather question.",
  inputSchema: {
    type: "object",
    properties: { city: { type: "string", description: "City name, e.g. Tempe" } },
    required: ["city"],
    additionalProperties: false,
  },
};

async function getTemperature(city) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(
      `https://wttr.in/${encodeURIComponent(city)}?format=%l:+%c+%t+humidity+%h+wind+%w`,
      { signal: ctrl.signal, headers: { "User-Agent": "opencode-mcp-weather" } }
    );
    if (!res.ok) return `Weather lookup failed (HTTP ${res.status}) for ${city}.`;
    return (await res.text()).trim();
  } catch (e) {
    return `Weather lookup failed for ${city}: ${e.message}`;
  } finally {
    clearTimeout(t);
  }
}

function reply(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
}

function replyError(id, code, message) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }) + "\n");
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on("line", async (line) => {
  line = line.trim();
  if (!line) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  if (msg.method && msg.method.startsWith("notifications/")) return; // no reply
  const id = msg.id;
  try {
    if (msg.method === "initialize") {
      reply(id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "weather", version: "1.0.0" },
      });
    } else if (msg.method === "tools/list") {
      reply(id, { tools: [TOOL] });
    } else if (msg.method === "tools/call") {
      const name = msg.params && msg.params.name;
      const city = msg.params && msg.params.arguments && msg.params.arguments.city;
      if (name !== "get_temperature" || !city) {
        replyError(id, -32602, "expected get_temperature with {city}");
        return;
      }
      const text = await getTemperature(String(city));
      reply(id, { content: [{ type: "text", text }] });
    } else {
      replyError(id, -32601, `unknown method ${msg.method}`);
    }
  } catch (e) {
    replyError(id, -32603, e.message);
  }
});
