export const NotificationPlugin = async ({ $ }) => {
  return {
    event: async ({ event }) => {
      if (event.type === "session.idle") {
        try {
          await $`notify-send "opencode" "Session completed!" --icon=dialog-information`
        } catch {}
      }
      if (event.type === "session.error") {
        try {
          await $`notify-send "opencode" "Session encountered an error" --icon=dialog-error`
        } catch {}
      }
    },
  }
}
