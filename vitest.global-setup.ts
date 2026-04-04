// vitest.global-setup.ts — Runs in main process BEFORE test workers spawn
import { readFileSync } from "node:fs";
import dotenv from "dotenv";

export default function setup() {
  const envPath = ".env.test";
  try {
    const envVars = dotenv.parse(readFileSync(envPath, "utf-8"));
    for (const [key, value] of Object.entries(envVars)) {
      process.env[key] = value;
    }
    console.log(`[global-setup] Loaded ${Object.keys(envVars).length} env vars from ${envPath}`);
  } catch (e) {
    console.warn(`[global-setup] Could not load ${envPath}:`, e);
  }
}
