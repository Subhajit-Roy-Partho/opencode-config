/**
 * Desktop notifier (replaces the opencode-notify npm package):
 * fires a native notification when a session goes idle or errors.
 *
 * v2 module: `export default { id, server, setup }` (opencode >= 2.x
 * requires a default object with `id` plus `effect`/`setup`).
 * `server` keeps the v1 hook map for older hosts; `setup` subscribes
 * to the native v2 event stream (`session.execution.succeeded` /
 * `session.execution.failed`).
 */

async function notify(title, message, $sh) {
  try {
    if ($sh) {
      if (process.platform === "darwin") {
        await $sh`osascript -e 'display notification "${message}" with title "${title}"'`
      } else {
        await $sh`notify-send "${title}" "${message}"`
      }
      return
    }
    const { execFile } = await import("node:child_process")
    const run = (cmd, args) =>
      new Promise((resolve) => execFile(cmd, args, () => resolve()))
    if (process.platform === "darwin") {
      await run("osascript", ["-e", `display notification "${message}" with title "${title}"`])
    } else {
      await run("notify-send", [title, message])
    }
  } catch {}
}

/**
 * @type {import("@opencode-ai/plugin").Plugin}
 */
const NotificationPlugin = async ({ $ }) => {
  const isMac = process.platform === "darwin"
  const notifyFn = async (title, message) => {
    try {
      if (isMac) {
        await $`osascript -e 'display notification "${message}" with title "${title}"'`
      } else {
        await $`notify-send "${title}" "${message}"`
      }
    } catch {}
  }

  return {
    event: async ({ event }) => {
      if (event.type === "session.idle") {
        await notifyFn("opencode", "Session completed!")
      }
      if (event.type === "session.error") {
        await notifyFn("opencode", "Session encountered an error")
      }
    },
  }
}

const setup = async (ctx) => {
  const $sh = ctx.$ ?? (typeof Bun !== "undefined" ? Bun.$ : undefined)
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
          if (type === "session.execution.succeeded" || type === "session.idle") {
            await notify("opencode", "Session completed!", $sh)
          } else if (type === "session.execution.failed" || type === "session.error") {
            await notify("opencode", "Session encountered an error", $sh)
          }
        }
      } catch {}
    })()
  } catch (err) {
    console.error("[notification] v2 event subscription failed:", err)
  }
  return async () => {
    stopped = true
    try {
      await iterator?.return?.()
    } catch {}
  }
}

export default {
  id: "notification",
  server: NotificationPlugin,
  setup,
}
