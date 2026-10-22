#!/usr/bin/env node
/**
 * Emits /build-info.json during Docker build (build-info stage).
 *
 * Only reads build-args turned into env: SOURCE_REF, SOURCE_COMMIT,
 * SOURCE_COMMIT_DATE, SOURCE_COMMIT_MESSAGE or SOURCE_COMMIT_MESSAGE_B64,
 * BUILD_TIME, IMAGE_TAG. Callers (GitHub Actions, local docker-build.sh,
 * any remote builder) must pass those --build-arg values.
 *
 * Deprecated aliases: BACKEND_BRANCH / FRONTEND_BRANCH for SOURCE_REF.
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
