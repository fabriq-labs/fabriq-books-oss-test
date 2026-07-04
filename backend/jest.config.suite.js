/** @type {import('jest').Config} */
const base = require('./jest.config.js');

/**
 * Core business / workflow test suite.
 *
 * Excludes:
 * - src/agent/__tests__ (agent sessions, prompts, LLM E2E)
 * - src/__tests__/agent (agent routes, email, analytics)
 * - integrations (Zoho Books, etc.)
 * - import (bank statement import pipelines)
 * - broker (Questrade / broker sync)
 * - purchase-order-zoho, purchase-order-quickbooks
 * - LLM prompt harnesses (posting-prompt, posting-sample-questions)
 */
module.exports = {
  ...base,
  displayName: 'business-suite',
  bail: 0,
  testPathIgnorePatterns: [
    ...(base.testPathIgnorePatterns || []),
    '/node_modules/',
    '/src/agent/__tests__/',
    '/src/__tests__/agent/',
    '/src/__tests__/integrations/',
    '/src/__tests__/import/',
    '/src/__tests__/broker/',
    'purchase-order-zoho\\.test\\.ts$',
    'purchase-order-quickbooks\\.test\\.ts$',
    'posting-prompt\\.test\\.ts$',
    'posting-sample-questions\\.test\\.ts$',
  ],
};
