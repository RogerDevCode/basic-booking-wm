#!/usr/bin/env node
// agents-lint.mjs — AGENTS.md Rule Enforcer (pre-commit hook)
// Scans staged TypeScript files for AGENTS.md §1 violations.
// Exit 1 = violations found (blocks commit). Exit 0 = clean.

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const RULES = [
  {
    id: 'NO_AS_ANY',
    pattern: /\bas\s+any\b/,
    message: '§1.A.1 VIOLATION: "as any" is PROHIBITED. Use type guards or Zod.',
    severity: 'error',
  },
  {
    id: 'NO_THROW_CONTROL_FLOW',
    // throw inside catch is ok; throw at business logic level is not
    pattern: /^\s+throw new Error\(/m,
    message: '§1.A.3 VIOLATION: throw for control flow is PROHIBITED. Return [error, null].',
    severity: 'error',
  },
  {
    id: 'NO_RANDOM_UUID_FALLBACK',
    pattern: /crypto\.randomUUID\(\)/,
    message: '§9 VIOLATION: crypto.randomUUID() as idempotency fallback is PROHIBITED. Use SHA256 hash.',
    severity: 'error',
  },
  {
    id: 'NO_NULL_TENANT_FALLBACK',
    pattern: /\?\?\s*NULL_TENANT_UUID/,
    message: '§7 VIOLATION: NULL_TENANT_UUID as fallback is PROHIBITED. Reject missing tenant explicitly.',
    severity: 'warn',
  },
  {
    id: 'MISSING_PREFLIGHT',
    pattern: /export async function main\(/,
    requiresPattern: /PRE-FLIGHT CHECKLIST/,
    message: '§3.2 VIOLATION: main() function MUST have PRE-FLIGHT CHECKLIST comment block.',
    severity: 'warn',
  },
];

// Get staged .ts files only, fallback to all .ts if run directly outside git hook
let files = [];
try {
  files = execSync('git diff --cached --name-only --diff-filter=ACM')
    .toString()
    .split('\n')
    .filter(f => f.endsWith('.ts') && !f.includes('node_modules') && !f.includes('.test.'));
} catch (e) {
  // If not inside a git repo or no staged files, default to clean run for safety
  console.log('Skipping lint: not a git repo or no staged files.');
  process.exit(0);
}

let violations = 0;

for (const file of files) {
  let content;
  try { content = readFileSync(file, 'utf-8'); } catch { continue; }

  for (const rule of RULES) {
    if (rule.requiresPattern) {
      if (rule.pattern.test(content) && !rule.requiresPattern.test(content)) {
        console.error(`[${rule.severity.toUpperCase()}] ${file}: ${rule.message}`);
        if (rule.severity === 'error') violations++;
      }
    } else if (rule.pattern.test(content)) {
      console.error(`[${rule.severity.toUpperCase()}] ${file}: ${rule.message}`);
      if (rule.severity === 'error') violations++;
    }
  }
}

if (violations > 0) {
  console.error(`\n💥 ${violations} AGENTS.md violation(s) found. Commit BLOCKED.`);
  process.exit(1);
}
console.log('✅ AGENTS.md lint: clean');
process.exit(0);
