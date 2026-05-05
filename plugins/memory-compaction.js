export const CompactionPlugin = async () => {
  return {
    "experimental.session.compacting": async (input, output) => {
      output.context.push(`## Persistent Memory
- Preserve key decisions made during this session
- Remember files being actively worked on
- Maintain context about the current task status and progress
- Keep track of any unresolved issues or blockers
- Retain information about the user's preferences and coding style
- Remember any important API contracts or data structures discussed`)
    },
  }
}