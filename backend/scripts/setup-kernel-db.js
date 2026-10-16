#!/usr/bin/env node
/**
 * Create the kernel app database from the Prisma schema and seed org_system.
 * Applies generated SQL. Does not use prisma db push.
 *
 *   DATABASE_URL=postgresql://kernel:kernel@localhost:5432/kernel_app npm run setup:kernel
 */
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const backendRoot = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(backendRoot, '.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

function psql(url, args) {
  execSync(`psql "${url}" ${args}`, {
    stdio: 'inherit',
    cwd: backendRoot,
    env: process.env,
  });
}

function databaseExists(adminUrl, name) {
  const out = execSync(
    `psql "${adminUrl}" -tAc "SELECT 1 FROM pg_database WHERE datname = '${name.replace(/'/g, '')}'"`,
    { cwd: backendRoot, env: process.env }
  ).toString().trim();
  return out === '1';
}

function main() {
  const url = new URL(databaseUrl);
  const dbName = decodeURIComponent(url.pathname.replace(/^\//, '').split('/')[0]);
  if (!dbName || dbName === 'postgres') {
    console.error('DATABASE_URL must name an application database, not postgres');
    process.exit(1);
  }

  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = '/postgres';

  if (!databaseExists(adminUrl.toString(), dbName)) {
    console.log(`Creating database ${dbName}`);
    psql(adminUrl.toString(), `-c "CREATE DATABASE \\"${dbName}\\""`);
  } else {
    console.log(`Database ${dbName} already exists`);
  }

  const hasOrg = execSync(
    `psql "${databaseUrl}" -tAc "SELECT to_regclass('public.organizations') IS NOT NULL"`,
    { cwd: backendRoot, env: process.env }
  ).toString().trim();

  if (hasOrg !== 't') {
    console.log('Generating schema SQL from prisma/schema');
    const sql = execSync(
      'npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema --script',
      { cwd: backendRoot, env: { ...process.env, DATABASE_URL: databaseUrl } }
    ).toString();
    const file = path.join(os.tmpdir(), `kernel-schema-${Date.now()}.sql`);
    fs.writeFileSync(file, sql);
    console.log(`Applying ${file}`);
    psql(databaseUrl, `-v ON_ERROR_STOP=1 -f "${file}"`);
  } else {
    console.log('organizations table exists; leaving the schema in place');
  }

  console.log('Seeding kernel org, admin, and views');
  execSync('npx ts-node --transpile-only src/utils/setup/seedKernel.ts', {
    stdio: 'inherit',
    cwd: backendRoot,
    env: process.env,
  });
}

main();
