// Block reads AND writes of secret files so keys can't leak into context or disk.
export const EnvProtection = async () => {
  const guardedTools = new Set(["read", "edit", "write"]);
  const isSecretFile = (filePath) => {
    if (typeof filePath !== "string") return false;
    const base = filePath.split("/").pop();
    if (base === ".env.example") return false;
    return (
      base === ".env" ||
      base.startsWith(".env.") ||
      base.endsWith(".pem") ||
      base.endsWith(".key")
    );
  };

  return {
    "tool.execute.before": async (input, output) => {
      if (!guardedTools.has(input.tool)) return;
      const filePath = output?.args?.filePath;
      if (isSecretFile(filePath)) {
        throw new Error(
          `Refusing to ${input.tool} secret file "${filePath}". ` +
            `Copy the pattern to a non-secret file or use placeholder values instead.`
        );
      }
    },
  };
};
