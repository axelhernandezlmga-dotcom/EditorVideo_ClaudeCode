import { defineConfig } from "vitest/config";

// Config aparte de vite.config.ts (que apunta a web/): los tests viven en tests/.
export default defineConfig({
  test: { root: ".", include: ["tests/**/*.test.ts"], environment: "node" },
});
