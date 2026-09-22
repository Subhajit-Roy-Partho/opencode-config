/**
 * Rejects interactive shell commands (editors, pagers, monitors)
 * so the agent uses non-interactive alternatives instead.
 *
 * v2 module: `export default { id, server, setup }` (opencode >= 2.x
 * requires a default object with `id` plus `effect`/`setup`).
 * `server` keeps the v1 hook map for older hosts; `setup` registers
 * the same guard through the native v2 `ctx.tool.hook` API.
 */

const INTERACTIVE_COMMANDS = ["vim", "nano", "less", "more", "top", "htop", "watch", "tail -f", "ssh"]

function rejectIfInteractive(cmd) {
  if (typeof cmd !== "string") return
  const first = cmd.trim().split(" ")[0]
  if (INTERACTIVE_COMMANDS.some((ic) => cmd.trim().startsWith(ic))) {
    throw new Error(`Interactive command "${first}" detected. Use non-interactive alternatives instead.`)
  }
}

/**
 * @type {import("@opencode-ai/plugin").Plugin}
 */
const ShellStrategyPlugin = async () => {
  return {
    "tool.execute.before": async (input, output) => {
      if (input.tool === "bash") {
        const cmd = output.args.command
        const interactiveCommands = ["vim", "nano", "less", "more", "top", "htop", "watch", "tail -f", "ssh"]
        const isInteractive = interactiveCommands.some(ic => cmd.trim().startsWith(ic))
        if (isInteractive) {
          throw new Error(`Interactive command "${cmd.trim().split(' ')[0]}" detected. Use non-interactive alternatives instead.`)
        }
      }
    },
  }
}

const setup = async (ctx) => {
  const disposers = []
  try {
    // v2 names the shell tool "bash" (v1 permission alias also covers "execute").
    const reg = await ctx.tool.hook("execute.before", async (event) => {
      const name = typeof event.tool === "string" ? event.tool.toLowerCase() : ""
      if (name !== "bash" && name !== "execute") return
      rejectIfInteractive(event.input?.command)
    })
    disposers.push(() => reg.dispose())
  } catch (err) {
    console.error("[shell-strategy] v2 hook registration failed:", err)
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
  id: "shell-strategy",
  server: ShellStrategyPlugin,
  setup,
}
