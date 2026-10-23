#!/usr/bin/env node
/**
 * Dev bootstrap for coding agents / local engineers.
 *
 * Loads Books views + optional chart/demo data, then marks onboarding complete
 * so the UI does not hit R-ONBOARD-ERR. This is NOT tenant onboarding — do not
 * use this path when an operator is creating a real tenant (AUTO_SETUP + wizard).
 *
 *   cd backend && npm run seed:dev
 *   cd backend && npm run seed:dev -- india
 *   cd backend && npm run seed:dev -- us-ca --skip-demo
 *
 * Expects setup:kernel (or AUTO_SETUP schema+identity) already done.
 */
const { execSync } = require('child_process');
const path = require('path');

const backendRoot = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const skipDemo = args.includes('--skip-demo');
const geo = args.find((a) => a === 'india' || a === 'us-ca') || 'us-ca';

function run(cmd) {
  console.log(`\n→ ${cmd}`);
  execSync(cmd, {
    cwd: backendRoot,
    env: process.env,
    stdio: 'inherit',
    shell: true,
  });
}

const viewSeeds = [
  'npm run seed:gl',
  'npm run seed:entities',
  'npm run seed:sales',
  'npm run seed:ar-settlement',
  'npm run seed:connections',
];

for (const cmd of viewSeeds) run(cmd);

run(`npm run seed:coa -- ${geo}`);
if (!skipDemo) {
  // books-demo expects India chart codes for the India entity journals;
  // us-ca chart still works for US demo accounts; India journals need india codes.
  // Prefer us-ca for US-first agent envs; pass india when you need the FX demo.
  run('npm run seed:books-demo');
}

if (require('fs').existsSync(path.join(backendRoot, 'src/utils/setup/seedSalesCatalog.ts'))) {
  run('npm run seed:sales-catalog');
}

run(`npm run seed:mark-onboarding-complete -- org_kernel ${geo}`);

console.log(`\nDev bootstrap done (geo=${geo}${skipDemo ? ', skip-demo' : ''}).`);
console.log('Sign in as admin@example.com / admin123 — wizard should not block.');
