/**
 * Prompt-queue drain (`/queue`): holds prompts queued via `/queue <text>`
 * in `~/.config/opencode/.queue.md` and injects them once background
 * work finishes.
 *
 * SYNTHESIZED-IDLE CAVEAT: opencode has no native `task.completed` hook,
 * so "all background tasks done" is approximated here — on `session.idle`
 * (plus the v2 `session.execution.succeeded` event) we debounce 2s, then
 * confirm quiescence via the session status map (no busy/retry state on
 * this session or its children) before popping the oldest entry and
 * injecting it via `client.session.prompt`. A `session.idle` that fires
 * while a background task is merely between steps will look idle; the
 * status-map check is the guard, and `/queue-run` is the manual escape
 * hatch when the approximation misses. Never blocks or breaks the
 * session: every hook body is wrapped in try/catch and never throws.
 *
 * v2 module: `export default { id, server, setup }` (opencode >= 2.x
 * requires a default object with `id` plus `effect`/`setup`).
 * `server` keeps the v1 `event` hook (with `client.app.log`) for
 * older hosts; `setup` watches the native v2 event stream.
 */

import { promises as fs } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const SERVICE = "queue-drain"
const DEBOUNCE_MS = 2000
const ENTRY_MARKER = "## "
const SEPARATOR = "\n---\n"

function queuePath() {
  const dir = process.env.OPENCODE_CONFIG_DIR || join(homedir(), ".config", "opencode")
  return join(dir, ".queue.md")
}

async function log(client, level, message) {
  try {
    await client.app.log({ body: { service: SERVICE, level, message } })
  } catch {}
}

async function readQueue() {
  try {
    return await fs.readFile(queuePath(), "utf8")
  } catch {
    return ""
  }
}

function splitEntries(raw) {
  if (!raw || !raw.includes(ENTRY_MARKER)) return []
  return raw
    .split(SEPARATOR)
    .map((block) => block.trim())
    .filter((block) => block.startsWith(ENTRY_MARKER))
}

function entryBody(entry) {
  const lines = entry.split("\n")
  lines.shift() // drop the `## <timestamp>` header
  return lines.join("\n").trim()
}

async function writeQueue(entries) {
  try {
    const raw = entries.length === 0 ? "" : entries.join(SEPARATOR) + SEPARATOR
    await fs.writeFile(queuePath(), raw, "utf8")
  } catch {}
}

/** Pop the oldest entry; returns its body text, or null when empty. */
async function popOldest() {
  const entries = splitEntries(await readQueue())
  if (entries.length === 0) return null
  const oldest = entries.shift()
  await writeQueue(entries)
  return entryBody(oldest)
}

/**
 * Confirm quiescence via the session status map: no busy/retry state on
 * the session itself or its children. Fails open (returns true) when the
 * status API is unavailable so a missing API never wedges the queue.
 */
async function isQuiescent(client, sessionID) {
  try {
    const status = await client.session.status?.()
    if (!status || typeof status !== "object") return true
    const states = status instanceof Map ? status.values() : Object.values(status)
    for (const state of states) {
      const s = String(state?.status ?? state ?? "").toLowerCase()
      if (s === "busy" || s === "retry" || s === "running" || s === "working") return false
      if (sessionID && state?.sessionID === sessionID && state?.busy) return false
    }
    return true
  } catch {
    return true
  }
}

async function injectNext(client, sessionID) {
  try {
    if (!(await isQuiescent(client, sessionID))) return
    const text = await popOldest()
    if (!text) return
    await log(client, "info", `queue-drain: injecting queued prompt (${text.slice(0, 80)})`)
    await client.session.prompt({ body: { sessionID, text } })
    // Loop until the queue is empty or something goes busy.
    await injectNext(client, sessionID)
  } catch {}
}

/**
 * @type {import("@opencode-ai/plugin").Plugin}
 */
const QueueDrainPlugin = async ({ client }) => {
  const timers = new Map()
  return {
    event: async ({ event }) => {
      try {
        if (event.type !== "session.idle") return
        const sessionID = event.properties?.sessionID ?? event.sessionID
        if (!sessionID) return
        if (timers.has(sessionID)) clearTimeout(timers.get(sessionID))
        timers.set(
          sessionID,
          setTimeout(() => {
            timers.delete(sessionID)
            injectNext(client, sessionID)
          }, DEBOUNCE_MS),
        )
      } catch {}
    },
  }
}

const setup = async (ctx) => {
  let stopped = false
  let iterator
  const timers = new Map()
  const schedule = (sessionID) => {
    try {
      if (!sessionID || stopped) return
      if (timers.has(sessionID)) clearTimeout(timers.get(sessionID))
      timers.set(
        sessionID,
        setTimeout(async () => {
          timers.delete(sessionID)
          try {
            const client = ctx.client
            if (!client) return
            if (!(await isQuiescent(client, sessionID))) return
            const text = await popOldest()
            if (!text) return
            await client.session.prompt({ body: { sessionID, text } })
            // Loop until the queue is empty or something goes busy.
            let guard = 25
            while (guard-- > 0) {
              if (!(await isQuiescent(client, sessionID))) break
              const next = await popOldest()
              if (!next) break
              await client.session.prompt({ body: { sessionID, text: next } })
            }
          } catch {}
        }, DEBOUNCE_MS),
      )
    } catch {}
  }
  try {
    const stream = ctx.event.subscribe()
    iterator = stream[Symbol.asyncIterator]()
    ;(async () => {
      try {
        while (!stopped) {
          const next = await iterator.next()
          if (next.done) break
          try {
            const value = next.value ?? {}
            const type = typeof value.type === "string" ? value.type : ""
            if (type === "session.idle" || type === "session.execution.succeeded") {
              schedule(value.properties?.sessionID ?? value.sessionID)
            }
          } catch {}
        }
      } catch {}
    })()
  } catch (err) {
    console.error("[queue-drain] v2 event subscription failed:", err)
  }
  return async () => {
    stopped = true
    for (const timer of timers.values()) {
      try {
        clearTimeout(timer)
      } catch {}
    }
    timers.clear()
    try {
      await iterator?.return?.()
    } catch {}
  }
}

export default {
  id: "queue-drain",
  server: QueueDrainPlugin,
  setup,
}
