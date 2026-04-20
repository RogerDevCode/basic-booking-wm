// ============================================================================
// ESLint 9.x Flat Configuration - TypeScript 6.0 Strict Mode
// ============================================================================

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import sonarjs from 'eslint-plugin-sonarjs';
import unicorn from 'eslint-plugin-unicorn';
import noNull from 'eslint-plugin-no-null';

export default tseslint.config(
  // Global ignores
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'coverage/**',
      '**/*.js',
      '**/*.d.ts',
      '**/*.test.ts',
      '**/*.spec.ts',
      '**/backup/*.ts',
      '**/v2.0_backup.ts',
      '**/v2.1_backup.ts',
      '**/v2.2_backup.ts',
      'f/flows/**/*.ts',
      'f/internal/message_parser/**/*.ts',
      'internal/cache/**/*.ts',
    ],
  },

  // Base ESLint recommended
  eslint.configs.recommended,

  // TypeScript strict + stylistic (with some relaxations for Windmill scripts)
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  // Global settings
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      sonarjs,
      unicorn,
      'no-null': noNull,
    },
    rules: {
      // ============================================================================
      // STRICT TYPE SAFETY (Go-level) - CRITICAL
      // ============================================================================
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'warn', // Relax for Windmill resources and DB queries
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn', // Relax for dynamic API calls
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-invalid-void-type': 'error',

      // ============================================================================
      // CONDITIONAL ANALYSIS (from strictTypeChecked)
      // DISABLED: no-unnecessary-condition generates 184 false positives for
      // defensive null-checks on postgres query results. TypeScript doesn't
      // include `undefined` in array[index] types, but runtime CAN produce
      // empty arrays. The 9 real dead-code bugs will be fixed manually.
      // See: docs/red_team_investigation_2026-04-08.md
      // ============================================================================
      '@typescript-eslint/no-unnecessary-condition': 'off',

      // ============================================================================
      // CODE QUALITY
      // ============================================================================
      'no-constant-condition': 'error',
      'no-self-compare': 'error',
      '@typescript-eslint/no-redundant-type-constituents': 'warn',
      '@typescript-eslint/prefer-for-of': 'warn',
      'no-implicit-coercion': ['error', {
        boolean: true,
        number: true,
        string: true,
      }],
      '@typescript-eslint/no-base-to-string': 'warn',
      '@typescript-eslint/restrict-template-expressions': 'warn', // Relax for logging

      // ============================================================================
      // EXPLICIT RETURN TYPES
      // ============================================================================
      '@typescript-eslint/explicit-function-return-type': ['warn', {
        allowExpressions: true,
        allowTypedFunctionExpressions: true,
        allowHigherOrderFunctions: true,
        allowDirectConstAssertionInArrowFunctions: true,
        allowConciseArrowFunctionExpressionsStartingWithVoid: false,
      }],
      '@typescript-eslint/explicit-module-boundary-types': 'warn',

      // ============================================================================
      // SWITCH & CONTROL FLOW
      // ============================================================================
      '@typescript-eslint/switch-exhaustiveness-check': 'warn',
      'default-case-last': 'error',

      // ============================================================================
      // PREFERENCES
      // ============================================================================
      '@typescript-eslint/no-unnecessary-type-arguments': 'warn',
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',
      '@typescript-eslint/prefer-optional-chain': 'warn',
      '@typescript-eslint/prefer-includes': 'warn',
      '@typescript-eslint/prefer-as-const': 'warn',
      '@typescript-eslint/prefer-literal-enum-member': 'error',
      '@typescript-eslint/prefer-readonly': 'warn',
      'prefer-const': ['warn', {
        destructuring: 'all',
        ignoreReadBeforeAssign: false,
      }],
      '@typescript-eslint/no-var-requires': 'error',
      'no-var': 'error',
      'no-throw-literal': 'error',

      // ============================================================================
      // DEPRECATIONS (allow for now, fix incrementally)
      // ============================================================================
      '@typescript-eslint/no-deprecated': 'warn',

      // ============================================================================
      // UNICORN (selective rules)
      // ============================================================================
      'unicorn/prevent-abbreviations': 'off',
      'unicorn/no-null': 'off',
      'unicorn/filename-case': 'off',
      'unicorn/prefer-at': 'warn',
      'unicorn/prefer-string-slice': 'warn',

      // ============================================================================
      // SONARJS (selective rules)
      // ============================================================================
      'sonarjs/cognitive-complexity': 'off',
      'sonarjs/no-nested-template-literals': 'off',
      'sonarjs/prefer-single-boolean-return': 'off',

      // ============================================================================
      // NULL HANDLING (allowed for DB compatibility)
      // ============================================================================
      'no-null/no-null': 'off',

      // ============================================================================
      // WINDMILL-SPECIFIC RELAXATIONS
      // ============================================================================
      '@typescript-eslint/consistent-type-definitions': 'off', // Allow type aliases
      '@typescript-eslint/non-nullable-type-assertion-style': 'warn',
      '@typescript-eslint/dot-notation': 'warn',
      '@typescript-eslint/no-unnecessary-condition': 'off', // See comment at line 65
    },
  },

  // Overrides for Windmill scripts (f/) - More relaxed for runtime scripts
  {
    files: ['f/**/*.ts'],
    rules: {
      'unicorn/prefer-module': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-non-null-assertion': 'warn',
    },
  },

  // Overrides for test files (named *.test.ts / *.spec.ts)
  // Must come AFTER f/**/*.ts override to take precedence
  {
    files: ['*.test.ts', '*.spec.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
    },
  },

  // Overrides for integration/red-team test files not suffixed .test.ts
  // Must come AFTER f/**/*.ts override to take precedence
  {
    files: [
      '**/*integration*.ts',
      '**/redis-production.ts',
      '**/context-adjustment.ts',
      '**/redteam.ts',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
    },
  },
);
