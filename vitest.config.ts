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
    globalSetup: ["./vitest.global-setup.ts"],
    setupFiles: ["./vitest.env.setup.ts"],
    // Pass non-DB env vars to workers; DATABASE_URL comes from .env.test.runtime (testcontainers)
    // AI_AGENT_LLM_MODE="test" forces rule-based fast-path — no real LLM calls during test runs.
    // For LLM integration tests, override this env var in the specific test file or run with:
    //   AI_AGENT_LLM_MODE=llm npx vitest run <file>
    env: {
      AI_AGENT_LLM_MODE: "test",
      GROQ_LLM_TIMEOUT_MS: "15000",
    },
    testTimeout: 60000,
    passWithNoTests: true,
  },
  esbuild: {
    target: "es2022",
  },
});
