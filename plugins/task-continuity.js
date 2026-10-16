// Task continuity: resume in-progress work automatically after compaction.
//
// New plugin format required by opencode >= 2.0 (default export with id + setup).
// Old named-export format ("export const X = ...") fails to load with:
//   "Plugin must export a default definition with an id and an effect or setup function."
async function setup(ctx) {
  return {
    "experimental.session.compacting": async (input, output) => {
      output.context.push(
        "## Task Continuity Rules\n" +
        "If a task was in progress when this compaction occurred, you MUST continue from exactly where you left off. " +
        "Do NOT ask the user to confirm continuation or type 'continue'. Just proceed with the next step automatically. " +
        "Preserve all pending work items, file modifications in progress, and the exact next action that was planned."
      )
    },
  }
}

export default { id: "task-continuity", setup }
