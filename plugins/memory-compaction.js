/**
 * Adds persistent-memory guidance so key decisions, active files and
 * blockers survive context compaction.
 *
 * v2 module: `export default { id, server, setup }` (opencode >= 2.x
 * requires a default object with `id` plus `effect`/`setup`).
 * `server` keeps the v1 `experimental.session.compacting` hook for
 * older hosts; `setup` registers the native v2 `compaction` session
 * hook, which carries `event.messages` instead of a context array.
 */

const MEMORY_GUIDANCE = `## Persistent Memory
- Preserve key decisions made during this session
- Remember files being actively worked on
- Maintain context about the current task status and progress
- Keep track of any unresolved issues or blockers
- Retain information about the user's preferences and coding style
- Remember any important API contracts or data structures discussed`

const MARKER = "## Persistent Memory"

function messageText(message) {
  try {
    const content = message?.content
    if (typeof content === "string") return content
    if (Array.isArray(content)) {
      return content
        .map((p) => (p && typeof p.text === "string" ? p.text : ""))
        .join("\n")
    }
  } catch {}
  return ""
}

/**
 * @type {import("@opencode-ai/plugin").Plugin}
 */
const CompactionPlugin = async () => {
  return {
    "experimental.session.compacting": async (input, output) => {
      output.context.push(MEMORY_GUIDANCE)
    },
  }
}

const setup = async (ctx) => {
  const disposers = []
  try {
    const reg = await ctx.session.hook("compaction", async (event) => {
      // Fail open: compaction must never break because of this plugin.
      try {
        if (!event || !Array.isArray(event.messages) || event.messages.length === 0) return
        const already = event.messages.some((m) => messageText(m).includes(MARKER))
        if (already) return
        const part = { type: "text", text: MEMORY_GUIDANCE }
        const last = event.messages[event.messages.length - 1]
        if (last && Array.isArray(last.content)) {
          last.content.push(part)
        } else {
          event.messages.push({ role: "user", content: [part] })
        }
      } catch {}
    })
    disposers.push(() => reg.dispose())
  } catch (err) {
    console.error("[memory-compaction] v2 hook registration failed:", err)
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
  id: "memory-compaction",
  server: CompactionPlugin,
  setup,
}
