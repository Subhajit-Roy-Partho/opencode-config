/**
 * Local bridge for the `opencode-supermemory` npm package.
 *
 * Upstream (v2.0.13) only has a named `SupermemoryPlugin` export, but
 * opencode v2 requires every plugin module to
 * `export default { id, effect|setup }`. This bridge keeps the memory
 * backend without a forked package.
 *
 * What the bridge does in `setup`:
 * - builds a minimal v1-style input (directory, $ from Bun, stub
 *   project) and invokes the upstream factory so its init path runs;
 * - forwards the v1 `event` hook to the native v2 event stream and
 *   adapts `tool.execute.before/after` via `ctx.tool.hook`;
 * - CANNOT forward `chat.message`, custom `tool` definitions or the
 *   v1 compaction hooks — those need the full v1->v2 adapter layer
 *   (see oh-my-opencode-slim). They are skipped with a console note.
 *   Full memory capture returns once upstream ships a v2 entrypoint,
 *   at which point this file can be deleted and `opencode-supermemory`
 *   put back in `plugin[]` directly.
 * - fails open: any error returns a no-op disposer, startup continues.
 *
 * Requires SUPERMEMORY_API_KEY (or an interactive login); without it
 * the upstream factory disables itself and the bridge is a no-op.
 */
import { SupermemoryPlugin } from "opencode-supermemory"

const setup = async (ctx) => {
  let stopped = false
  const disposers = []
  try {
    const directory =
      typeof ctx.location?.directory === "string" && ctx.location.directory
        ? ctx.location.directory
        : process.cwd()
    const $sh = ctx.$ ?? (typeof Bun !== "undefined" ? Bun.$ : undefined)
    const hooks = await SupermemoryPlugin({
      client: ctx.client,
      project: { id: "global", directory },
      directory,
      worktree: directory,
      experimental_workspace: { register() {} },
      $: $sh,
    })
    if (!hooks || typeof hooks !== "object") return async () => {}

    const before = hooks["tool.execute.before"]
    if (typeof before === "function") {
      const reg = await ctx.tool.hook("execute.before", async (event) => {
        const out = { args: { ...(event.input ?? {}) } }
        await before(
          { tool: event.tool, sessionID: event.sessionID, callID: event.id },
          out,
        )
        event.input = out.args
      })
      disposers.push(() => reg.dispose())
    }

    const after = hooks["tool.execute.after"]
    if (typeof after === "function") {
      const reg = await ctx.tool.hook("execute.after", async (event) => {
        const output = { title: "", output: "", metadata: {} }
        await after(
          {
            tool: event.tool,
            sessionID: event.sessionID,
            callID: event.id,
            args: event.input,
          },
          output,
        )
      })
      disposers.push(() => reg.dispose())
    }

    if (typeof hooks.event === "function") {
      const stream = ctx.event.subscribe()
      const iterator = stream[Symbol.asyncIterator]()
      disposers.push(async () => {
        stopped = true
        try {
          await iterator.return?.()
        } catch {}
      })
      ;(async () => {
        try {
          while (!stopped) {
            const next = await iterator.next()
            if (next.done) break
            try {
              await hooks.event({ event: next.value })
            } catch {}
          }
        } catch {}
      })()
    }

    for (const key of Object.keys(hooks)) {
      if (["event", "tool.execute.before", "tool.execute.after", "dispose"].includes(key)) continue
      console.info(`[supermemory-bridge] v1 hook "${key}" has no v2 equivalent here - skipped`)
    }
  } catch (err) {
    console.error("[supermemory-bridge] setup failed open:", err)
  }
  return async () => {
    stopped = true
    for (const dispose of disposers) {
      try {
        await dispose()
      } catch {}
    }
  }
}

export default {
  id: "supermemory-bridge",
  server: SupermemoryPlugin,
  setup,
}
