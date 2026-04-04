#!/usr/bin/env node
/**
 * Emits /build-info.json during Docker build (build-info stage).
 * Monorepo: SOURCE_REF, SOURCE_COMMIT, SOURCE_COMMIT_DATE, optional SOURCE_COMMIT_MESSAGE
 * or SOURCE_COMMIT_MESSAGE_B64 (base64 UTF-8). BACKEND_BRANCH/FRONTEND_BRANCH envs are
 * deprecated aliases for SOURCE_REF (same value applied to both JSON blocks).
 */
const fs = require('fs');

function decodeMessage() {
  const b64 = process.env.SOURCE_COMMIT_MESSAGE_B64;
  if (b64 && String(b64).trim()) {
    try {
      return Buffer.from(String(b64).trim(), 'base64').toString('utf8').trim();
    } catch {
      return '';
    }
  }
  return (process.env.SOURCE_COMMIT_MESSAGE || '').trim();
}

const ref =
  process.env.SOURCE_REF ||
  process.env.BACKEND_BRANCH ||
  process.env.FRONTEND_BRANCH ||
  'unknown';

const commit = process.env.SOURCE_COMMIT || 'unknown';
const commitMessage = decodeMessage();
const commitDate = process.env.SOURCE_COMMIT_DATE || '';

const block = {
  branch: ref,
  commit,
  commitMessage,
  commitDate,
};

const out = {
  backend: { ...block },
  frontend: { ...block },
  dockerImageBuildTime: process.env.BUILD_TIME || '',
  dockerImageTag: process.env.IMAGE_TAG || 'unknown',
};

fs.writeFileSync('/build-info.json', JSON.stringify(out, null, 2));
console.log('build-info.json written');
