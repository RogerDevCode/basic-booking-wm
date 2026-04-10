// vitest.env.setup.ts — MUST run before ANY test file imports
import { readFileSync, existsSync } from "node:fs";
import dotenv from "dotenv";

// First, load runtime env from testcontainers (if available)
const runtimeEnvPath = ".env.test.runtime";
if (existsSync(runtimeEnvPath)) {
  const runtimeVars = dotenv.parse(readFileSync(runtimeEnvPath, "utf-8"));
  for (const [key, value] of Object.entries(runtimeVars)) {
    process.env[key] = value;
  }
  console.log(`[vitest.env.setup] Loaded DATABASE_URL from ${runtimeEnvPath}`);
} else {
  console.log(`[vitest.env.setup] WARNING: ${runtimeEnvPath} not found`);
}

// Then load .env.test for other vars (API keys, etc.)
const envPath = ".env.test";
try {
  const envVars = dotenv.parse(readFileSync(envPath, "utf-8"));
  for (const [key, value] of Object.entries(envVars)) {
    // NEVER override DATABASE_URL from .env.test if runtime already set it
    if (key === "DATABASE_URL" || key === "TEST_DATABASE_URL") {
      if (process.env[key]?.includes("localhost") && process.env[key] !== value) {
        continue; // Keep the runtime value
      }
    }
    process.env[key] = value;
  }
} catch {
  // .env.test not found — skip
}
