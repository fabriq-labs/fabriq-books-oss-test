#!/usr/bin/env node
/**
 * Emits /build-info.json during Docker build (build-info stage).
 * Reads BACKEND_BRANCH, FRONTEND_BRANCH, BUILD_TIME, IMAGE_TAG from env.
 */
const { execSync } = require('child_process');
const fs = require('fs');

function gitInfo(dir) {
  const commit = execSync(`git -C ${dir} rev-parse HEAD`).toString().trim();
  const commitMessage = execSync(`git -C ${dir} log -1 --format=%B`).toString().trim();
  const commitDate = execSync(`git -C ${dir} log -1 --format=%cI`).toString().trim();
  return { commit, commitMessage, commitDate };
}

const out = {
  backend: { branch: process.env.BACKEND_BRANCH || 'unknown', ...gitInfo('/src/backend') },
  frontend: { branch: process.env.FRONTEND_BRANCH || 'unknown', ...gitInfo('/src/frontend-1') },
  dockerImageBuildTime: process.env.BUILD_TIME || '',
  dockerImageTag: process.env.IMAGE_TAG || 'unknown',
};

fs.writeFileSync('/build-info.json', JSON.stringify(out, null, 2));
console.log('build-info.json written');
