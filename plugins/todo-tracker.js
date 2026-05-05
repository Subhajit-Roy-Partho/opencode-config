export const TodoTrackerPlugin = async ({ client }) => {
  return {
    event: async ({ event }) => {
      if (event.type === "session.created") {
        await client.app.log({
          body: {
            service: "todo-tracker",
            level: "info",
            message: "New session started - todo tracking active",
          },
        })
      }
    },
  }
}