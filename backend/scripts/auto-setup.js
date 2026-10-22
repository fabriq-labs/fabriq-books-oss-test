#!/usr/bin/env node
/**
 * First-boot schema + seed when AUTO_SETUP is enabled.
 * Used by /start.sh inside the container and runnable locally for the same contract.
 *
 * Gates:
 * - Apply Prisma SQL only when public.organizations is missing (one transaction).
 * - Kernel identity seed only when user_kernel_admin is missing (seedKernel is non-clobber).
 * - Books view seeds when their views are missing.
 *
 * Does not run seed:coa or seed:books-demo.
 */
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Client } = require('pg');

const backendRoot = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(backendRoot, '.env') });
require('dotenv').config({ path: path.join(backendRoot, '..', '.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const LOCK_KEY = 87423019;

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function runPsql(sqlOrArgs, opts = {}) {
  const url = new URL(databaseUrl);
  const env = {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.replace(/^\//, '').split('/')[0]),
  };
  const args = Array.isArray(sqlOrArgs)
    ? sqlOrArgs
    : ['-v', 'ON_ERROR_STOP=1', '-tAc', sqlOrArgs];
  const result = spawnSync('psql', args, {
    cwd: backendRoot,
    env,
    encoding: 'utf8',
    stdio: opts.stdio || 'pipe',
  });
  if (result.status !== 0) {
    const err = (result.stderr || result.stdout || '').trim();
    throw new Error(err || `psql failed with ${result.status}`);
  }
  return (result.stdout || '').trim();
}

async function withPgClient(fn) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end().catch(() => {});
  }
}

async function waitForPostgres(maxAttempts = 60) {
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      await withPgClient(async (client) => {
        await client.query('SELECT 1');
      });
      console.log('Postgres is accepting connections');
      return;
    } catch {
      console.log(`Waiting for Postgres (${i}/${maxAttempts})...`);
      sleep(1000);
    }
  }
  throw new Error('Postgres did not become ready in time');
}

async function hasOrganizations(client) {
  const res = await client.query(
    "SELECT to_regclass('public.organizations') IS NOT NULL AS ok"
  );
  return res.rows[0]?.ok === true;
}

function applySchemaTransactionally() {
  console.log('Generating schema SQL from prisma/schema');
  const sql = execSync(
    'npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema --script',
    { cwd: backendRoot, env: process.env, encoding: 'utf8' }
  );
  const wrapped = `BEGIN;\n${sql}\nCOMMIT;\n`;
  const file = path.join(os.tmpdir(), `kernel-schema-${Date.now()}.sql`);
  fs.writeFileSync(file, wrapped);
  console.log('Applying schema in one transaction');
  runPsql(['-v', 'ON_ERROR_STOP=1', '-f', file], { stdio: 'inherit' });
}

async function viewExists(client, name) {
  try {
    const res = await client.query('SELECT 1 FROM "view" WHERE name = $1 LIMIT 1', [name]);
    return res.rowCount > 0;
  } catch {
    return false;
  }
}

async function userAdminExists(client) {
  try {
    const res = await client.query('SELECT 1 FROM "user" WHERE id = $1 LIMIT 1', [
      'user_kernel_admin',
    ]);
    return res.rowCount > 0;
  } catch {
    return false;
  }
}

function npmRun(script) {
  console.log(`Running npm run ${script}`);
  execSync(`npm run ${script}`, {
    cwd: backendRoot,
    env: process.env,
    stdio: 'inherit',
  });
}

async function main() {
  const url = new URL(databaseUrl);
  const dbName = decodeURIComponent(url.pathname.replace(/^\//, '').split('/')[0]);
  if (!dbName || dbName === 'postgres') {
    console.error('DATABASE_URL must name an application database, not postgres');
    process.exit(1);
  }

  // Ensure application database exists (same idea as setup:kernel).
  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = '/postgres';
  await (async () => {
    const admin = new Client({ connectionString: adminUrl.toString() });
    await admin.connect();
    try {
      const found = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
      if (found.rowCount === 0) {
        console.log(`Creating database ${dbName}`);
        await admin.query(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);
      } else {
        console.log(`Database ${dbName} already exists`);
      }
    } finally {
      await admin.end();
    }
  })();

  await waitForPostgres();

  await withPgClient(async (client) => {
    console.log('Acquiring setup advisory lock');
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
    try {
      if (!(await hasOrganizations(client))) {
        applySchemaTransactionally();
      } else {
        console.log('organizations table exists; leaving the schema in place');
      }

      console.log('Generating Prisma client');
      execSync('npx prisma generate', {
        cwd: backendRoot,
        env: process.env,
        stdio: 'inherit',
      });

      if (!(await userAdminExists(client))) {
        console.log('Seeding kernel identity (admin absent)');
        execSync('npx ts-node --transpile-only src/utils/setup/seedKernel.ts', {
          cwd: backendRoot,
          env: process.env,
          stdio: 'inherit',
        });
      } else {
        console.log('Kernel admin exists; skipping identity seed');
      }

      const viewSeeds = [
        { script: 'seed:gl', views: ['account_view', 'posting_view'] },
        { script: 'seed:entities', views: ['entity_view', 'exchange_rate_view'] },
        {
          script: 'seed:sales',
          views: [
            'customer_view',
            'invoice_view',
            'invoice_edit_view',
            'payment_terms_view',
            'item_master_view',
            'supplier_view',
            'tax_master_view',
            'tax_group_view',
            'tax_region_view',
          ],
        },
        {
          script: 'seed:ar-settlement',
          views: [
            'payment_receipt_view',
            'payment_receipt_edit_view',
            'credit_note_view',
            'credit_note_edit_view',
          ],
        },
        { script: 'seed:connections', views: ['source_system_view'] },
      ];

      for (const entry of viewSeeds) {
        let missing = false;
        for (const v of entry.views) {
          if (!(await viewExists(client, v))) {
            missing = true;
            break;
          }
        }
        if (missing) npmRun(entry.script);
        else console.log(`${entry.script}: views present, skip`);
      }
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {});
    }
  });

  console.log('AUTO_SETUP complete');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
