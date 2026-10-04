import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import globals from 'globals'

export default tseslint.config({
  files: ['src/app/invoice/**/*.{ts,tsx}'],
  extends: [js.configs.recommended, ...tseslint.configs.recommended],
  languageOptions: { globals: { ...globals.browser, ...globals.node } },
  rules: {
    // The unversioned provider SDK exposes dynamic payloads; tsc checks local contracts.
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
    'eqeqeq': ['error', 'always', { null: 'ignore' }],
    'no-debugger': 'error',
  },
})
