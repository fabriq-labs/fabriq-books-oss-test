#!/usr/bin/env node
/**
 * Writes docker-build-meta.json from the local git checkout.
 *
 * Run this on the host before `docker build`, `docker compose up --build`,
 * or `railway up`. The Docker build context excludes .git, so the image cannot
 * discover commit metadata unless this file (or SOURCE_* / RAILWAY_GIT_* build
 * args) is present in the context.
 *
 * Usage: node docker-emit-build-meta.js
 *    or: npm run docker:meta
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const outPath = path.join(__dirname, 'docker-build-meta.json');

function git(args) {
  try {
    return execSync(`git ${args}`, {
      cwd: __dirname,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

const commit = git('rev-parse HEAD') || 'unknown';
const short = commit !== 'unknown' ? commit.slice(0, 12) : 'unknown';
const ref =
  git('branch --show-current') ||
  git('rev-parse --abbrev-ref HEAD') ||
  'unknown';
const commitMessage = git('log -1 --format=%B');
const commitDate = git('log -1 --format=%cI');
const buildTime = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const safeRef = String(ref)
  .toLowerCase()
  .replace(/[^a-z0-9._-]+/g, '-')
  .replace(/^-+|-+$/g, '') || 'local';
const tagTs = buildTime.replace(/[-:]/g, '').replace('T', '-').replace('Z', '');
const imageTag = `${safeRef}-${tagTs}`;

const meta = {
  ref: ref || 'unknown',
  commit,
  commitMessage,
  commitDate,
  imageTag,
  buildTime,
  short,
};

fs.writeFileSync(outPath, `${JSON.stringify(meta, null, 2)}\n`);
console.log(`Wrote ${path.basename(outPath)} (${meta.ref} @ ${short})`);
