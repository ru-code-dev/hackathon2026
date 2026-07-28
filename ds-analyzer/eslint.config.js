import js from '@eslint/js'
import { defineConfig } from 'eslint/config'
import prettier from 'eslint-config-prettier'
import tseslint from 'typescript-eslint'

export default defineConfig([
  {
    ignores: ['node_modules/**', 'artifacts/**', 'dist/**', 'coverage/**', 'dashboard/**'],
  },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          // The flat config is not part of the compilation; lint it with an inferred
          // program rather than dropping it from linting altogether.
          allowDefaultProject: ['eslint.config.js'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      // We walk `unknown` data loaded from the UI kit at runtime; narrowing guards on values
      // the compiler believes are already narrow are intentional defence, not dead code.
      '@typescript-eslint/no-unnecessary-condition': 'off',
      'no-console': ['error', { allow: ['error'] }],
      eqeqeq: ['error', 'always'],
    },
  },
  {
    files: ['src/cli/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    files: ['src/**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  prettier,
])
