export const NotificationPlugin = async ({ $ }) => {
  const isMac = process.platform === "darwin"
  const notify = async (title, message) => {
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
        await notify("opencode", "Session completed!")
      }
      if (event.type === "session.error") {
        await notify("opencode", "Session encountered an error")
      }
    },
  }
}