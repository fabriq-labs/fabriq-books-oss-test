import { createAgentRouter } from './routes';
import { AgentService } from './AgentService';
import logger from '../utils/logger';

/**
 * Create agent service with environment configuration
 */
export function createAgentService() {

  // Create and return agent service
  return new AgentService();
}

// Re-export components for easier imports
export { AgentService } from './AgentService';
export { ToolManager } from './ToolManager';
export { FunctionGenerator } from './FunctionGenerator';
export { FunctionExecutor } from './FunctionExecutor';
export { GENERIC_FUNCTIONS } from './GenericFunctions';
export * from './models/ModelProvider';
export * from './routes';
export { createSlackRouter } from './slack/routes';

// Main exports
export default {
  createAgentRouter,
  createAgentService,
  createSlackRouter: () => import('./slack/routes').then(m => m.createSlackRouter())
}; 