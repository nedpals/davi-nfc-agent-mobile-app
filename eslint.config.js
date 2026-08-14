// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

const jestGlobals = {
  jest: 'readonly',
  describe: 'readonly',
  it: 'readonly',
  test: 'readonly',
  expect: 'readonly',
  beforeAll: 'readonly',
  beforeEach: 'readonly',
  afterAll: 'readonly',
  afterEach: 'readonly',
};

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    files: ['__tests__/**/*', 'test-utils/**/*', 'jest.setup.js'],
    languageOptions: {
      globals: jestGlobals,
    },
    rules: {
      // Modules are required after their mocks are registered, which import
      // hoisting would defeat.
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
]);
