// vitest.global-setup.ts — Runs in main process BEFORE test workers spawn
import { readFileSync, writeFileSync } from "node:fs";
import dotenv from "dotenv";
import { setupTestDB, teardownTestDB, getTestDbUrl } from "./tests/setup-db";

export async function setup() {
  // Load .env.test
  const envPath = ".env.test";
  try {
    const envVars = dotenv.parse(readFileSync(envPath, "utf-8"));
    for (const [key, value] of Object.entries(envVars)) {
      process.env[key] = value;
    }
    console.log(`[global-setup] Loaded ${Object.keys(envVars).length} env vars from ${envPath}`);
  } catch {
    console.warn(`[global-setup] Could not load ${envPath}`);
  }

  // Start real PostgreSQL test container
  console.log("[global-setup] Starting testcontainers PostgreSQL...");
  try {
    await setupTestDB();
    const dbUrl = getTestDbUrl();
    if (dbUrl) {
      process.env["DATABASE_URL"] = dbUrl;
      process.env["TEST_DATABASE_URL"] = dbUrl;
      // Write to temp file so workers can read it
      writeFileSync(".env.test.runtime", `DATABASE_URL=${dbUrl}\nTEST_DATABASE_URL=${dbUrl}\n`);
      console.log(`[global-setup] Test DB ready: ${dbUrl.replace(/\/\/[^@]+@/, "//***@")}`);
    } else {
      console.log("[global-setup] WARNING: Test DB URL not available");
    }
  } catch (e) {
    console.error("[global-setup] Failed to start test DB:", e);
  }
}

export async function teardown() {
  console.log("[global-teardown] Stopping test DB...");
  try {
    await teardownTestDB();
  } catch {
    // Ignore teardown errors
  }
  // Clean up runtime env file
  try {
    const { unlinkSync } = await import("node:fs");
    unlinkSync(".env.test.runtime");
  } catch {
    // Ignore
  }
}
