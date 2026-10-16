/**
 * Barrel re-export — preserves all existing imports across the codebase.
 * New code should import directly from the focused module files:
 *   import { viewAPI } from '@/api/metadataApi'
 *   import { agentAPI } from '@/api/agentApi'
 *   import { adminAPI } from '@/api/superAdminApi'
 *   etc.
 */
export * from "./apiClient";
export * from "./metadataApi";
export * from "./agentApi";
export * from "./superAdminApi";
