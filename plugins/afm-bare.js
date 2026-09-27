/**
 * afm-bare: keeps the `afm` agent an unaltered bare chatbot on
 * apple-fm/system (minimal context, no AGENTS.md / project instructions, no
 * plugin system prompts, no memory guidance, minimal compaction passthrough).
 *
 * - Strictly scoped: every hook returns immediately unless the event belongs
 *   to the `afm` agent. `afm-agent` and all other agents pass through
 *   completely untouched.
 * - Registered LAST in opencode.jsonc so it runs after earlier plugins
 *   (apple-fm-slim, memory-compaction, ...) and can strip what they added.
 * - Every hook body fails open: a utility plugin must never break a session.
 *
 * v2 module: `export default { id, setup }` only — no `server` export and no
 * static bare-npm imports (local `.js` plugins fail to load with either).
 */

const SERVICE = "afm-bare"

// Minimal compaction passthrough: fixed short string, no model call content,
// no ~400-char memory guidance from plugins/memory-compaction.js.
const BARE_SUMMARY = "Afm bare session. No carryover."

// True only when the event positively identifies the `afm` agent. Anything
// else (afm-agent, other agents, unknown/missing agent fields) is NOT afm and
// passes through untouched.
function isAfm(event) {
  try {
    if (!event || typeof event !== "object") return false
    const candidates = [
      event.agent,
      event.agentName,
      event.agentID,
      event.model?.agent,
      event.session?.agent,
      event.properties?.agent,
      event.properties?.agentName,
    ]
    for (const c of candidates) {
      if (typeof c !== "string" || !c) continue
      const v = c.toLowerCase()
      // Exact `afm` only: `afm-agent` must NOT match.
      if (v === "afm") return true
    }
    return false
  } catch {
    return false
  }
}

function stripSystem(event) {
  // Fail open: any error leaves the request exactly as it was.
  try {
    if (!isAfm(event)) return
    if (event && typeof event === "object" && "system" in event) {
      event.system = []
    }
  } catch {}
}

function bareCompaction(event) {
  // Fail open: compaction must never break because of this plugin.
  try {
    if (!isAfm(event)) return
    if (event && typeof event === "object") {
      event.result = { summary: BARE_SUMMARY }
    }
  } catch {}
}

const setup = async (ctx) => {
  const disposers = []
  const registered = []
  const skipped = []
  const tryHook = async (name, fn) => {
    // Fail open per name: unsupported hook names throw here and are skipped.
    try {
      if (!ctx?.session || typeof ctx.session.hook !== "function") return false
      const reg = await ctx.session.hook(name, fn)
      disposers.push(() => reg.dispose())
      return true
    } catch {
      return false
    }
  }
  try {
    // "compaction" is the known-good v2 session hook (cf.
    // plugins/memory-compaction.js, same event.messages/event.result shape).
    // "context" and "generate" are best-effort: unsupported names throw at
    // registration time, are caught, and skipped.
    const specs = [
      ["context", stripSystem],
      ["compaction", bareCompaction],
      ["generate", stripSystem],
    ]
    for (const [name, fn] of specs) {
      let ok = false
      try {
        ok = await tryHook(name, async (event) => {
          try {
            await fn(event)
          } catch {}
        })
      } catch {
        ok = false
      }
      if (ok) registered.push(name)
      else skipped.push(name)
    }
    console.info(`[${SERVICE}] session hooks registered: [${registered.join(", ")}]; skipped: [${skipped.join(", ")}]`)
    if (registered.length === 0) {
      console.error(`[${SERVICE}] no session hook registered; bare-afm inactive`)
    }
  } catch (err) {
    console.error(`[${SERVICE}] v2 hook registration failed:`, err)
  }
  return async () => {
    for (const dispose of disposers) {
      try {
        await dispose()
      } catch {}
    }
  }
}

export default {
  id: "afm-bare",
  setup,
}
