export const TaskContinuity = async (ctx) => {
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
