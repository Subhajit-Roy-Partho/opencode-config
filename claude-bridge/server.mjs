#!/usr/bin/env node
// Minimal stdio MCP server: lets Claude Code (master) delegate work to `opencode run`.
// No dependencies. Tools: opencode_start (async), opencode_status, opencode_result, opencode_cancel, opencode_list.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { randomBytes } from 'node:crypto';
import { realpathSync } from 'node:fs';

const DEFAULT_MODEL = process.env.OPENCODE_BRIDGE_MODEL || 'opencode-go/muse-spark-1.3-contributor';
// Workers may only operate inside this root (set per-registration).
const ROOT = realpathSync(process.env.OPENCODE_BRIDGE_ROOT || process.cwd());
const GUARD = 'Rules: work only inside the current directory; never run git commit/push/config; never touch files outside your assigned paths; finish with a short summary of files created/changed.';
const tasks = new Map();

const tools = [
  { name: 'opencode_start', description: 'Start an opencode worker on a task; returns task id immediately. Poll with opencode_status, fetch with opencode_result.',
    inputSchema: { type: 'object', required: ['prompt'], properties: {
      prompt: { type: 'string' }, cwd: { type: 'string', description: 'Directory inside the allowed root' },
      model: { type: 'string', description: `default ${DEFAULT_MODEL}` }, session: { type: 'string', description: 'Previous task id to continue its session' } } } },
  { name: 'opencode_status', description: 'Status of a task (running/done/failed) and elapsed time.', inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },
  { name: 'opencode_result', description: 'Final text output (or tail of it while running) of a task.', inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' }, tail: { type: 'number' } } } },
  { name: 'opencode_cancel', description: 'Kill a running task.', inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },
  { name: 'opencode_list', description: 'List tasks.', inputSchema: { type: 'object', properties: {} } },
];

function inside(dir) { const r = realpathSync(dir); return r === ROOT || r.startsWith(ROOT + '/'); }

function start({ prompt, cwd = ROOT, model = DEFAULT_MODEL, session }) {
  if (!inside(cwd)) throw new Error(`cwd must be inside ${ROOT}`);
  const id = randomBytes(4).toString('hex');
  const args = ['run', '--format', 'json', '-m', model];
  const prev = session && tasks.get(session);
  if (prev?.sessionID) args.push('-s', prev.sessionID);
  args.push(`${GUARD}\n\n${prompt}`);
  const t = { id, status: 'running', started: Date.now(), text: '', sessionID: prev?.sessionID, err: '' };
  const p = spawn('opencode', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  t.proc = p;
  createInterface({ input: p.stdout }).on('line', (l) => {
    try { const j = JSON.parse(l); t.sessionID ||= j.sessionID; if (j.type === 'text') t.text += j.part?.text ?? ''; } catch {}
  });
  p.stderr.on('data', (d) => { t.err = (t.err + d).slice(-4000); });
  p.on('close', (code) => { t.status = t.status === 'cancelled' ? 'cancelled' : code === 0 ? 'done' : 'failed'; t.ended = Date.now(); });
  tasks.set(id, t);
  return id;
}

const get = (id) => { const t = tasks.get(id); if (!t) throw new Error('unknown task'); return t; };
const el = (t) => Math.round(((t.ended ?? Date.now()) - t.started) / 1000);

function call(name, a) {
  switch (name) {
    case 'opencode_start': return `task ${start(a)} started`;
    case 'opencode_status': { const t = get(a.id); return `${t.status} (${el(t)}s, ${t.text.length} chars)`; }
    case 'opencode_result': { const t = get(a.id); const s = t.text || t.err || '(no output yet)'; return `[${t.status}]\n` + (a.tail ? s.slice(-a.tail) : s); }
    case 'opencode_cancel': { const t = get(a.id); t.status = 'cancelled'; t.proc.kill('SIGTERM'); return 'cancelled'; }
    case 'opencode_list': return [...tasks.values()].map((t) => `${t.id} ${t.status} ${el(t)}s`).join('\n') || 'none';
    default: throw new Error('unknown tool');
  }
}

const send = (m) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...m }) + '\n');
createInterface({ input: process.stdin }).on('line', (line) => {
  let m; try { m = JSON.parse(line); } catch { return; }
  if (m.id === undefined) return; // notification
  try {
    if (m.method === 'initialize') send({ id: m.id, result: { protocolVersion: m.params?.protocolVersion ?? '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'opencode-bridge', version: '0.1.0' } } });
    else if (m.method === 'tools/list') send({ id: m.id, result: { tools } });
    else if (m.method === 'tools/call') {
      try { send({ id: m.id, result: { content: [{ type: 'text', text: call(m.params.name, m.params.arguments ?? {}) }] } }); }
      catch (e) { send({ id: m.id, result: { isError: true, content: [{ type: 'text', text: String(e.message) }] } }); }
    } else send({ id: m.id, result: {} });
  } catch (e) { send({ id: m.id, error: { code: -32603, message: String(e.message) } }); }
});
process.on('exit', () => tasks.forEach((t) => t.status === 'running' && t.proc.kill()));
