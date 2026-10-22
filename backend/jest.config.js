module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/lib'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  // LLM prompt harnesses — run via npm run test:posting-prompt / test:posting-sample-questions
  testPathIgnorePatterns: [
    '/node_modules/',
    'posting-prompt\\.test\\.ts$',
    'posting-sample-questions\\.test\\.ts$',
  ],
  // setupFilesAfterEnv removed - each test suite manages its own setup
  // setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  setupFiles: ['<rootDir>/src/__tests__/env-setup.ts'],
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  bail: 1, // Stop running tests after the first failure
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  globals: {
    'ts-jest': {
      tsconfig: 'src/__tests__/tsconfig.json',
    },
  },
  collectCoverageFrom: [
    'src/tenancy/**/*.ts',
    'src/auth/publicPaths.ts',
    'src/workflow-engine/core/assignment.ts',
    'src/services/analytics/sqlExecutor.ts',
  ],
}; 