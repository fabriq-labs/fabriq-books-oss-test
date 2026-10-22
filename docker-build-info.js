#!/usr/bin/env node
/**
 * Emits /build-info.json during Docker build (build-info stage).
 *
 * Resolution order for each field (first usable wins):
 *   1. Explicit SOURCE_* / IMAGE_TAG / BUILD_TIME build-args (CI)
 *   2. /docker-build-meta.json from build context (host emit / railway up)
 *   3. RAILWAY_GIT_* build-args (GitHub-connected Railway Dockerfile builds)
 *   4. unknown / empty
 *
 * Host emit: `npm run docker:meta` → docker-build-meta.json (see docker-emit-build-meta.js).
 * Deprecated: BACKEND_BRANCH / FRONTEND_BRANCH as aliases for SOURCE_REF.
 */
const fs = require('fs');

const META_PATH = '/docker-build-meta.json';

function isUsable(value, { allowUnknown = false } = {}) {
  if (value == null) return false;
  const s = String(value).trim();
  if (!s) return false;
  if (!allowUnknown && s === 'unknown') return false;
  return true;
}

function first(values, fallback, opts) {
  for (const v of values) {
    if (isUsable(v, opts)) return String(v).trim();
  }
  return fallback;
}

function decodeMessage() {
  const b64 = process.env.SOURCE_COMMIT_MESSAGE_B64;
  if (isUsable(b64, { allowUnknown: true })) {
    try {
      return Buffer.from(String(b64).trim(), 'base64').toString('utf8').trim();
    } catch {
      return '';
    }
  }
  return (process.env.SOURCE_COMMIT_MESSAGE || '').trim();
}

function readFileMeta() {
  try {
    const raw = fs.readFileSync(META_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

const fileMeta = readFileMeta();

const ref = first(
  [
    process.env.SOURCE_REF,
    process.env.BACKEND_BRANCH,
    process.env.FRONTEND_BRANCH,
    fileMeta.ref,
    process.env.RAILWAY_GIT_BRANCH,
  ],
  'unknown'
);

const commit = first(
  [
    process.env.SOURCE_COMMIT,
    fileMeta.commit,
    process.env.RAILWAY_GIT_COMMIT_SHA,
  ],
  'unknown'
);

const commitMessage = first(
  [
    decodeMessage(),
    fileMeta.commitMessage,
    process.env.RAILWAY_GIT_COMMIT_MESSAGE,
  ],
  '',
  { allowUnknown: true }
);

const commitDate = first(
  [process.env.SOURCE_COMMIT_DATE, fileMeta.commitDate],
  '',
  { allowUnknown: true }
);

const dockerImageTag = first(
  [process.env.IMAGE_TAG, fileMeta.imageTag],
  'unknown'
);

const dockerImageBuildTime = first(
  [process.env.BUILD_TIME, fileMeta.buildTime],
  '',
  { allowUnknown: true }
);

const block = {
  branch: ref,
  commit,
  commitMessage,
  commitDate,
};

const out = {
  backend: { ...block },
  frontend: { ...block },
  dockerImageBuildTime,
  dockerImageTag,
};

fs.writeFileSync('/build-info.json', JSON.stringify(out, null, 2));
console.log(
  `build-info.json written (${ref} @ ${commit === 'unknown' ? 'unknown' : commit.slice(0, 12)})`
);
