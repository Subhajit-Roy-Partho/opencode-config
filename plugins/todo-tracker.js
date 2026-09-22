/**
 * Logs session start so todo-tracking state can be correlated
 * with sessions in `opencode logs`.
 *
 * v2 module: `export default { id, server, setup }` (opencode >= 2.x
 * requires a default object with `id` plus `effect`/`setup`).
 * `server` keeps the v1 `event` hook (with `client.app.log`) for
 * older hosts; `setup` watches the native v2 event stream — the v2
 * setup context carries no SDK client, so it logs to the console.
 */

/**
 * @type {import("@opencode-ai/plugin").Plugin}
 */
const TodoTrackerPlugin = async ({ client }) => {
  return {
    event: async ({ event }) => {
      if (event.type === "session.created") {
        await client.app.log({
          body: {
            service: "todo-tracker",
            level: "info",
            message: "New session started - todo tracking active",
          },
        })
      }
    },
  }
}

const setup = async (ctx) => {
  let stopped = false
  let iterator
  try {
    const stream = ctx.event.subscribe()
    iterator = stream[Symbol.asyncIterator]()
    ;(async () => {
      try {
        while (!stopped) {
          const next = await iterator.next()
          if (next.done) break
          const type = typeof next.value?.type === "string" ? next.value.type : ""
          if (type === "session.created") {
            console.info("[todo-tracker] New session started - todo tracking active")
          }
        }
      } catch {}
    })()
  } catch (err) {
    console.error("[todo-tracker] v2 event subscription failed:", err)
  }
  return async () => {
    stopped = true
    try {
      await iterator?.return?.()
    } catch {}
  }
}

export default {
  id: "todo-tracker",
  server: TodoTrackerPlugin,
  setup,
}
