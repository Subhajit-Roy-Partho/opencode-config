export const NotificationPlugin = async ({ $ }) => {
  const isMac = process.platform === "darwin";
  // Strip characters that would break out of the shell-quoted notification text.
  const safe = (s) => String(s ?? "").replace(/["`$\\]/g, "").slice(0, 200);

  let hasNotifySend = false;
  if (!isMac) {
    try {
      await $`command -v notify-send`;
      hasNotifySend = true;
    } catch {
      hasNotifySend = false;
    }
  }

  const notify = async (title, message) => {
    try {
      if (isMac) {
        await $`osascript -e 'display notification "${safe(message)}" with title "${safe(title)}"'`;
      } else if (hasNotifySend) {
        await $`notify-send "${safe(title)}" "${safe(message)}"`;
      }
      // No notifier available (minimal Linux/container): silently skip.
    } catch {}
  };

  return {
    event: async ({ event }) => {
      if (event.type === "session.idle") {
        await notify("opencode", "Session completed!");
      }
      if (event.type === "session.error") {
        await notify("opencode", "Session encountered an error");
      }
    },
  };
};
