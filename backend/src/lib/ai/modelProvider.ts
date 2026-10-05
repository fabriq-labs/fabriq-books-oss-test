/**
 * Unified LLM Model Provider Factory
 *
 * Single entry point for all LLM calls in the application.
 * Supports per-task model/provider overrides via environment variables.
 *
 * Resolution order:
 *   Provider:  LLM_PROVIDER                       (single global, required)
 *   Model:     LLM_MODEL_{TASK}  →  LLM_MODEL     (task-specific falls back to global, required)
 *
 * Required env vars:
 *   LLM_PROVIDER  – one of: vertex, openai, openrouter, custom
 *   LLM_MODEL     – model identifier (e.g. gemini-2.0-flash-001, gpt-4o)
 *
 * Supported providers:
 *   vertex     – Google Vertex AI  (uses ADC / service account)
 *   openai     – OpenAI directly   (needs OPENAI_API_KEY)
 *   openrouter – OpenRouter         (needs OPENROUTER_API_KEY)
 *   custom     – Any OpenAI-compat  (needs LLM_BASE_URL + LLM_API_KEY)
 *
 * Tasks used in the codebase:
 *   agent          – multi-step agent chat with tool calling
 *   categorization – structured output for transaction categorization
 *   merchant_key   – LLM merchant_key normalize (LLM_MODEL_MERCHANT_KEY)
 *   extraction     – document / PDF extraction (may need vision)
 *   analysis       – financial analysis (structured JSON output)
 */

import { createVertex } from '@ai-sdk/google-vertex';
import { createOpenAI } from '@ai-sdk/openai';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

type ProviderName = 'vertex' | 'openai' | 'openrouter' | 'custom';
type ProviderFn = (modelId: string) => any;

// ---------------------------------------------------------------------------
// GCP credential bootstrap (runs once, before any Vertex provider is created)
// ---------------------------------------------------------------------------
let _credsDone = false;

function ensureGCPCredentials(): void {
  if (_credsDone) return;
  _credsDone = true;

  const b64 = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON_BASE64;
  if (!b64 || process.env.GOOGLE_APPLICATION_CREDENTIALS) return;

  try {
    const json = Buffer.from(b64, 'base64').toString();
    const tmp = path.join(os.tmpdir(), `gcp-creds-${process.pid}.json`);
    fs.writeFileSync(tmp, json, { mode: 0o600 });
    process.env.GOOGLE_APPLICATION_CREDENTIALS = tmp;
    process.on('exit', () => {
      try { fs.unlinkSync(tmp); } catch { /* best-effort */ }
    });
  } catch {
    // Non-fatal: credentials may not be required if using a non-GCP provider
  }
}

// ---------------------------------------------------------------------------
// Provider instance cache (one instance per unique config)
// ---------------------------------------------------------------------------
const _providers = new Map<string, ProviderFn>();

function resolveProvider(name: ProviderName): ProviderFn {
  const baseUrl = process.env.LLM_BASE_URL;
  const cacheKey = `${name}:${baseUrl ?? ''}`;
  const cached = _providers.get(cacheKey);
  if (cached) return cached;

  let provider: ProviderFn;

  switch (name) {
    case 'vertex': {
      ensureGCPCredentials();
      const v = createVertex({
        project: process.env.GOOGLE_CLOUD_PROJECT_ID!,
        location: process.env.GOOGLE_LOCATION || 'us-central1',
      });
      provider = (id) => v(id);
      break;
    }

    case 'openai': {
      const oai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY! });
      provider = (id) => oai(id);
      break;
    }

    case 'openrouter': {
      const or = createOpenAI({
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: process.env.OPENROUTER_API_KEY!,
      });
      provider = (id) => or(id);
      break;
    }

    case 'custom': {
      const apiKey = process.env.LLM_API_KEY || 'no-key';
      const c = createOpenAI({ baseURL: baseUrl!, apiKey });
      provider = (id) => c(id);
      break;
    }

    default:
      throw new Error(`Unknown LLM provider: ${name}`);
  }

  _providers.set(cacheKey, provider);
  return provider;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Return a Vercel AI SDK LanguageModel for the given task.
 *
 * @param task  Optional task name ('agent' | 'categorization' | 'extraction' | 'analysis').
 *              When supplied, task-specific env overrides are checked first.
 */
export function getModel(task?: string) {
  const taskUpper = task?.toUpperCase();

  const providerName = process.env.LLM_PROVIDER as ProviderName | undefined;

  if (!providerName) {
    throw new Error('AI not configured. Set LLM_PROVIDER in your configuration');
  }

  const modelId =
    (taskUpper ? process.env[`LLM_MODEL_${taskUpper}`] : undefined)
    || process.env.LLM_MODEL;

  if (!modelId) {
    const hint = task ? `LLM_MODEL_${task.toUpperCase()} or LLM_MODEL` : 'LLM_MODEL';
    throw new Error(`LLM model not configured. Set ${hint} in your .env file`);
  }

  return resolveProvider(providerName)(modelId);
}

/**
 * Return the resolved model ID string (for logging / observability).
 */
export function getModelId(task?: string): string {
  const taskUpper = task?.toUpperCase();
  return (
    (taskUpper ? process.env[`LLM_MODEL_${taskUpper}`] : undefined)
    || process.env.LLM_MODEL
    || 'unknown'
  );
}
