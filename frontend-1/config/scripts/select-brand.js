#!/usr/bin/env node
/**
 * Reads APP_NAME from env (default: zeiv), copies config/<APP_NAME>/ to src/config/, then exits.
 * Loads .env and .env.local from frontend root so APP_NAME is read when running npm run dev.
 * Run before Vite: node config/scripts/select-brand.js && vite
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, '../..');
const configRoot = path.join(frontendRoot, 'config');
const srcConfigDir = path.join(frontendRoot, 'src', 'config');

// Load .env and .env.local so APP_NAME is set when running via npm run dev
function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
      value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnvFile(path.join(frontendRoot, '.env'));
loadEnvFile(path.join(frontendRoot, '.env.local'));

const appName = process.env.APP_NAME?.trim() || 'zeiv';

const brandDir = path.join(configRoot, appName);
if (!fs.existsSync(brandDir) || !fs.statSync(brandDir).isDirectory()) {
  const dirs = fs.readdirSync(configRoot, { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name !== 'scripts')
    .map(d => d.name);
  console.error(`Error: config/${appName} does not exist. Set APP_NAME to one of: ${dirs.join(', ')}`);
  process.exit(1);
}

const configJsonPath = path.join(brandDir, 'config.json');
if (!fs.existsSync(configJsonPath)) {
  console.error(`Error: config/${appName}/config.json not found.`);
  process.exit(1);
}

if (!fs.existsSync(srcConfigDir)) {
  fs.mkdirSync(srcConfigDir, { recursive: true });
}

// Copy config.json
fs.copyFileSync(configJsonPath, path.join(srcConfigDir, 'config.json'));

// Copy favicon and logo (any file named favicon.* or logo.*)
const brandFiles = fs.readdirSync(brandDir);
for (const file of brandFiles) {
  if (file === 'config.json') continue;
  const base = path.basename(file, path.extname(file)).toLowerCase();
  const ext = path.extname(file);
  if (base === 'favicon' || base === 'logo') {
    fs.copyFileSync(path.join(brandDir, file), path.join(srcConfigDir, file));
  }
}

process.exit(0);
