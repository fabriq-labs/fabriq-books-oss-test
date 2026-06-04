import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

const BACKEND_ROOT = path.resolve(__dirname, '../../..');

export function loadBackendEnv(): void {
    const envTest = path.join(BACKEND_ROOT, '.env.test');
    const envFile = path.join(BACKEND_ROOT, '.env');
    if (fs.existsSync(envTest)) dotenv.config({ path: envTest });
    if (fs.existsSync(envFile)) dotenv.config({ path: envFile, override: true });
}

export function isLlmConfigured(): boolean {
    switch (process.env.LLM_PROVIDER) {
        case 'openrouter':
            return !!process.env.OPENROUTER_API_KEY;
        case 'openai':
            return !!process.env.OPENAI_API_KEY;
        case 'vertex':
            return !!(
                process.env.GOOGLE_CLOUD_PROJECT_ID &&
                (process.env.GOOGLE_APPLICATION_CREDENTIALS ||
                    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON_BASE64)
            );
        case 'custom':
            return !!(process.env.LLM_BASE_URL && process.env.LLM_API_KEY);
        default:
            return !!(
                process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
                process.env.GOOGLE_API_KEY ||
                process.env.OPENROUTER_API_KEY ||
                process.env.OPENAI_API_KEY
            );
    }
}

export function assertLlmConfigured(): void {
    if (isLlmConfigured()) {
        console.log(
            `LLM config: provider=${process.env.LLM_PROVIDER}, model=${process.env.LLM_MODEL || '(unset)'}`
        );
        return;
    }
    console.error('\n❌ LLM not configured. Set LLM_PROVIDER and credentials in backend/.env');
    process.exit(1);
}
