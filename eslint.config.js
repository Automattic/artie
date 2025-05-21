import globals from 'globals';
import tseslint from '@typescript-eslint/eslint-plugin';
import tseslintParser from '@typescript-eslint/parser';
import importPlugin from 'eslint-plugin-import';

export default [
  {
    // Define global variables
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021,
      },
    },
  },

  // TypeScript files
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tseslintParser,
      parserOptions: {
        project: './tsconfig.json',
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      import: importPlugin,
    },
    rules: {
      // TypeScript specific rules
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/ban-ts-comment': 'warn',

      // Functional programming preferences
      'no-var': 'error',
      'prefer-const': 'error',
      'no-param-reassign': 'error',
      'prefer-arrow-callback': 'error',
      'no-this-before-super': 'error',
      'no-class-assign': 'error',
      'no-confusing-arrow': 'error',
      'prefer-rest-params': 'error',
      'prefer-spread': 'error',
      'prefer-template': 'error',
      'no-useless-constructor': 'error',

      // ES Module imports
      'import/prefer-default-export': 'off',
      'import/no-extraneous-dependencies': 'error',
      'import/extensions': ['error', 'ignorePackages', { ts: 'never', tsx: 'never' }],
      'import/order': 'off',
    },
  },

  // JavaScript files
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    plugins: {
      import: importPlugin,
    },
    rules: {
      'no-var': 'error',
      'prefer-const': 'error',
      'no-param-reassign': 'error',
      'prefer-arrow-callback': 'error',
    },
  },

  // Test files can have different rules
  {
    files: ['**/*.test.ts', '**/*.spec.ts', '**/__tests__/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
    },
  },

  // Ignore patterns
  {
    ignores: ['**/node_modules/**', '**/dist/**', 'build/**', '.cache/**'],
  },
];
