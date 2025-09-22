import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: [
      "server/**/*.test.ts",
      "tests/**/*.test.ts"
    ],
    coverage: {
      reporter: ["text", "lcov"],
    },
  },
});
