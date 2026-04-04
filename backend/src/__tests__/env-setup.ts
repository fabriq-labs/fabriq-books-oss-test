import { config } from 'dotenv';
import path from 'path';

// Load .env.test file for tests
config({ path: path.resolve(process.cwd(), '.env.test') });

console.log('Test environment loaded from .env.test');
console.log('DATABASE_URL configured for tests:', process.env.DATABASE_URL ? 'Yes' : 'No');
