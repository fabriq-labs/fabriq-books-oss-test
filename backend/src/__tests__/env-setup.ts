import { config } from 'dotenv';
import path from 'path';
import fs from 'fs';

const cwd = process.cwd();
const backendRoot = path.resolve(__dirname, '../../');

const envCandidates = [
  path.resolve(cwd, '.env.test'),
  path.resolve(backendRoot, '.env.test'),
  path.resolve(cwd, '.env'),
  path.resolve(backendRoot, '.env'),
];

const loaded: string[] = [];
// For deterministic tests, ignore any shell-exported DATABASE_URL.
delete process.env.DATABASE_URL;
for (const candidate of envCandidates) {
  if (!fs.existsSync(candidate)) {
    continue;
  }
  config({ path: candidate, override: true });
  loaded.push(candidate);
  // Keep loading order deterministic, but stop once DATABASE_URL is available.
  if (process.env.DATABASE_URL) {
    break;
  }
}

console.log('process.env.DATABASE_URL', process.env.DATABASE_URL);

console.log(
  `Test env source: ${loaded.length ? loaded.join(' -> ') : 'none (using existing shell env only)'}`
);
console.log('DATABASE_URL configured for tests:', process.env.DATABASE_URL ? 'Yes' : 'No');
