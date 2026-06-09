import prisma from '../lib/prisma';
import logger from '../utils/logger';
import { FALLBACK_MODEL_NAME } from './toolRegistry';
import { runSeedAgentModelToolsSql } from '../utils/setup/metadata/seedAgentModelToolsSql';
import * as path from 'path';

/** Prisma model → table agent_model_tool_config */
export const AGENT_MODEL_TOOL_CONFIG_TABLE = 'agent_model_tool_config' as const;

export type AgentModelToolConfigRow = {
  id: string;
  model_name: string;
  display_name: string;
  description: string | null;
  model_tools: string[];
  include_analytics_tools: boolean;
  is_active: boolean;
  sort_order: number;
};

let cacheByModel: Map<string, AgentModelToolConfigRow> | null = null;
let cacheWarmPromise: Promise<void> | null = null;

export function invalidateModelToolCache(): void {
  cacheByModel = null;
  cacheWarmPromise = null;
}

export async function warmAgentModelToolCache(): Promise<void> {
  try {
    const rows = await prisma.agent_model_tool_config.findMany({
      orderBy: [{ sort_order: 'asc' }, { model_name: 'asc' }],
    });
    cacheByModel = new Map(
      rows.map((r: AgentModelToolConfigRow) => [r.model_name, r])
    );
    logger.info('Agent model tool config cache loaded from agent_model_tool_config', {
      count: rows.length,
    });
  } catch (error) {
    logger.warn('agent_model_tool_config table unavailable', {
      error: error instanceof Error ? error.message : String(error),
    });
    cacheByModel = new Map();
  }
}

async function ensureModelToolCache(): Promise<void> {
  if (cacheByModel) return;
  if (!cacheWarmPromise) {
    cacheWarmPromise = warmAgentModelToolCache().finally(() => {
      cacheWarmPromise = null;
    });
  }
  await cacheWarmPromise;
}

/** Load one model row from agent_model_tool_config (updates cache on hit). */
async function loadModelToolRowFromDb(
  modelName: string
): Promise<AgentModelToolConfigRow | undefined> {
  const row = await prisma.agent_model_tool_config.findUnique({
    where: { model_name: modelName },
  });
  if (row) {
    if (!cacheByModel) {
      cacheByModel = new Map();
    }
    cacheByModel.set(modelName, row as AgentModelToolConfigRow);
  }
  return row as AgentModelToolConfigRow | undefined;
}

async function resolveConfigRow(modelName: string): Promise<AgentModelToolConfigRow | undefined> {
  await ensureModelToolCache();

  let row = cacheByModel?.get(modelName);
  if (!row) {
    row = await loadModelToolRowFromDb(modelName);
  }

  if (!row && modelName !== FALLBACK_MODEL_NAME) {
    let fallback = cacheByModel?.get(FALLBACK_MODEL_NAME);
    if (!fallback) {
      fallback = await loadModelToolRowFromDb(FALLBACK_MODEL_NAME);
    }
    if (fallback) {
      logger.debug('Using _fallback row from agent_model_tool_config', { modelName });
      row = fallback;
    }
  }

  return row;
}

/**
 * Resolve model_tools from agent_model_tool_config only (cache + DB).
 * Used by ToolManager on every chat request.
 */
export async function resolveModelToolNames(modelName: string): Promise<string[]> {
  const row = await resolveConfigRow(modelName);

  if (row?.is_active && row.model_tools?.length) {
    return [...row.model_tools];
  }
  if (row && !row.is_active) {
    return [];
  }

  logger.warn('No agent_model_tool_config row for model', { modelName });
  return [];
}

export async function resolveIncludeAnalyticsTools(modelName: string): Promise<boolean> {
  const row = await resolveConfigRow(modelName);
  if (row) return row.include_analytics_tools;
  return false;
}

/** Admin list: rows from agent_model_tool_config only. */
export async function listModelToolConfigsForAdmin(): Promise<AgentModelToolConfigRow[]> {
  await warmAgentModelToolCache();
  const fromDb = cacheByModel ? [...cacheByModel.values()] : [];
  fromDb.sort((a, b) => a.sort_order - b.sort_order || a.model_name.localeCompare(b.model_name));
  return fromDb;
}

export async function upsertModelToolConfig(
  modelName: string,
  data: {
    display_name?: string;
    description?: string | null;
    model_tools: string[];
    include_analytics_tools?: boolean;
    is_active?: boolean;
    sort_order?: number;
  }
): Promise<AgentModelToolConfigRow> {
  const row = await prisma.agent_model_tool_config.upsert({
    where: { model_name: modelName },
    create: {
      model_name: modelName,
      display_name: data.display_name ?? modelName,
      description: data.description ?? null,
      model_tools: data.model_tools,
      include_analytics_tools: data.include_analytics_tools ?? true,
      is_active: data.is_active ?? true,
      sort_order: data.sort_order ?? 0,
    },
    update: {
      ...(data.display_name !== undefined && { display_name: data.display_name }),
      ...(data.description !== undefined && { description: data.description }),
      model_tools: data.model_tools,
      ...(data.include_analytics_tools !== undefined && {
        include_analytics_tools: data.include_analytics_tools,
      }),
      ...(data.is_active !== undefined && { is_active: data.is_active }),
      ...(data.sort_order !== undefined && { sort_order: data.sort_order }),
    },
  });
  invalidateModelToolCache();
  await warmAgentModelToolCache();
  return row as AgentModelToolConfigRow;
}

/** Apply prisma/seed-agent-model-tools.sql (idempotent upsert). Returns row count after seed. */
export async function seedDefaultModelToolConfigs(): Promise<number> {
  const backendRoot = path.resolve(__dirname, '../../..');
  runSeedAgentModelToolsSql(backendRoot);
  invalidateModelToolCache();
  await warmAgentModelToolCache();
  return cacheByModel?.size ?? 0;
}
