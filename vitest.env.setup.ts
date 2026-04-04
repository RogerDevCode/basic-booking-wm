// vitest.env.setup.ts — MUST run before ANY test file imports
// This file loads .env.test into process.env BEFORE modules are evaluated
import { readFileSync } from "node:fs";
import dotenv from "dotenv";

const envPath = ".env.test";
try {
  const envVars = dotenv.parse(readFileSync(envPath, "utf-8"));
  for (const [key, value] of Object.entries(envVars)) {
    process.env[key] = value;
  }
} catch {
  // .env.test not found — skip
}
