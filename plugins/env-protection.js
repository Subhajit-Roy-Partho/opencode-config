/**
 * Blocks accidental reads of secret files (.env) while still
 * allowing reads of the committed example template.
 *
 * v2 module: `export default { id, server, setup }` (opencode >= 2.x
 * requires a default object with `id` plus `effect`/`setup`).
 * `server` keeps the v1 hook map for older hosts; `setup` registers
 * the same guard through the native v2 `ctx.tool.hook` API.
 */

/**
 * @type {import("@opencode-ai/plugin").Plugin}
 */
const EnvProtection = async () => {
  return {
    "tool.execute.before": async (input, output) => {
      if (input.tool === "read" && output.args.filePath.includes(".env") && !output.args.filePath.includes(".env.example")) {
        throw new Error("Do not read .env files")
      }
    },
  }
}

const setup = async (ctx) => {
  const disposers = []
  try {
    const reg = await ctx.tool.hook("execute.before", async (event) => {
      const name = typeof event.tool === "string" ? event.tool.toLowerCase() : ""
      if (name !== "read") return
      const filePath = event.input?.filePath
      if (typeof filePath === "string" && filePath.includes(".env") && !filePath.includes(".env.example")) {
        throw new Error("Do not read .env files")
      }
    })
    disposers.push(() => reg.dispose())
  } catch (err) {
    console.error("[env-protection] v2 hook registration failed:", err)
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
  id: "env-protection",
  server: EnvProtection,
  setup,
}
