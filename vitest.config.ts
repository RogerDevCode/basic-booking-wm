import { defineConfig } from "vitest/config";
import dotenv from "dotenv";

// Load test env vars
dotenv.config({ path: ".env.test" });

export default defineConfig({
  test: {
    globals: true,
    include: ["f/**/*.test.ts", "tests/**/*.test.ts"],
    exclude: ["node_modules", "dist"],
  },
  esbuild: {
    target: "es2022",
  },
});
