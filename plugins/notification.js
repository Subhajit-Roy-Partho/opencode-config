export const NotificationPlugin = async ({ $ }) => {
  const notify = async (title, message) => {
    try {
      await $`osascript -e 'display notification "${message}" with title "${title}"'`
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