import { defineConfig } from "vitest/config";
import { readFileSync, existsSync } from "node:fs";
import dotenv from "dotenv";

// Load .env.test into process.env — this runs in the main process
// Vitest workers inherit process.env from the main process
const envPath = ".env.test";
if (existsSync(envPath)) {
  const envVars = dotenv.parse(readFileSync(envPath, "utf-8"));
  for (const [key, value] of Object.entries(envVars)) {
    process.env[key] = value;
  }
}

export default defineConfig({
  test: {
    globals: true,
    include: ["f/**/*.test.ts", "tests/**/*.test.ts"],
    exclude: ["node_modules", "dist"],
    // Pass env vars explicitly to workers
    env: {
      ...(existsSync(envPath) ? dotenv.parse(readFileSync(envPath, "utf-8")) : {}),
      AI_AGENT_LLM_MODE: "test",
      GROQ_LLM_TIMEOUT_MS: "2000",
    },
  },
  esbuild: {
    target: "es2022",
  },
});
