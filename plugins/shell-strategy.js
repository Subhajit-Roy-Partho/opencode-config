export const ShellStrategyPlugin = async () => {
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