import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // One file, sequential: every test shares the emulator's single project.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
