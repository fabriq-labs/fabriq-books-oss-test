import { WorkflowEngine } from '../workflow-engine';
import { PrismaClient } from '@prisma/client';
import { ModelService } from '../services/core/ModelService';
import { AuthContext } from '../auth/types';
import logger from '../utils/logger';

/**
 * Executes functions called by the agent
 */
export class FunctionExecutor {
  private modelService: ModelService;
  private workflowEngine: WorkflowEngine;
  private prisma: PrismaClient;
  
  constructor() {
    this.prisma = new PrismaClient();
    this.modelService = ModelService.getInstance();
    this.workflowEngine = new WorkflowEngine(this.prisma);
  }
  
  /**
   * Execute a function with the given parameters
   */
  async execute(functionName: string, parameters: any, context: AuthContext) {
    logger.debug('Executing function', { functionName, userId: context.user?.id });
    
    // Add user and org context to parameters
    parameters.userId = context.user?.id;
    parameters.orgId = context.user?.org_id;
    
    // Determine function type from name
    if (functionName.startsWith('create') || functionName.startsWith('update') || functionName.startsWith('delete')) {
      return this.executeCrudFunction(functionName, parameters, context);
    } else if (functionName.startsWith('search') || functionName.startsWith('get')) {
      return this.executeQueryFunction(functionName, parameters, context);
    } else if (functionName.includes('Workflow') || this.isWorkflowAction(functionName)) {
      return this.executeWorkflowFunction(functionName, parameters, context);
    }
    
    throw new Error(`Unknown function: ${functionName}`);
  }
  
  /**
   * Execute a CRUD function
   */
  private async executeCrudFunction(functionName: string, parameters: any, context: AuthContext) {
    const { userId, orgId, ...data } = parameters;
    
    // Extract model name and operation from function name
    const match = functionName.match(/^(create|update|delete)([A-Z][a-zA-Z]+)$/);
    if (!match) throw new Error(`Invalid CRUD function name: ${functionName}`);
    
    const [, operation, modelName] = match;
    const modelNameSnake = this.camelToSnake(modelName);
    
    // Call appropriate model service method
    switch (operation) {
      case 'create':
        return this.modelService.create(modelNameSnake, context, data);
      
      case 'update':
        if (!data.id) throw new Error('ID is required for update operation');
        return this.modelService.update(modelNameSnake, context, data.id, data);
        
      case 'delete':
        if (!data.id) throw new Error('ID is required for delete operation');
        return this.modelService.delete(modelNameSnake, context, data.id);
        
      default:
        throw new Error(`Unsupported operation: ${operation}`);
    }
  }
  
  /**
   * Execute a query function
   */
  private async executeQueryFunction(functionName: string, parameters: any, context: AuthContext) {
    const { userId, orgId, ...queryParams } = parameters;
    
    // Extract model name from function name
    const match = functionName.match(/^(search|get)([A-Z][a-zA-Z]+)$/);
    if (!match) throw new Error(`Invalid query function name: ${functionName}`);
    
    const [, operation, modelName] = match;
    const modelNameSnake = this.camelToSnake(modelName);
    
    if (operation === 'search') {
      return this.modelService.search(modelNameSnake, context, queryParams);
    } else {
      // Get by ID
      if (!queryParams.id) throw new Error('ID is required for get operation');
      return this.modelService.getById(modelNameSnake, context, queryParams.id);
    }
  }
  
  /**
   * Execute a workflow function
   */
  private async executeWorkflowFunction(functionName: string, parameters: any, context: AuthContext) {
    const { userId, orgId, ...workflowParams } = parameters;
    
    // Extract workflow name and action
    const match = functionName.match(/^(start|complete|cancel)([A-Z][a-zA-Z]+)Workflow$/);
    if (!match) throw new Error(`Invalid workflow function name: ${functionName}`);
    
    const [, action, workflowName] = match;
    
    // Execute workflow action
    switch (action) {
      case 'start':
        return this.workflowEngine.startWorkflow(workflowName, workflowParams.modelId, context.user?.id || '', workflowParams.metadata);
        
      case 'complete':
        // Get workflow instance and execute transition
        const instance = await this.prisma.workflow_instance.findFirst({
          where: { model_id: workflowParams.modelId }
        });
        if (!instance) throw new Error('No workflow instance found');
        
        const workflowContext = await this.workflowEngine.getWorkflowContext(instance.id, context);
        const actions = await this.workflowEngine.getAvailableActions(instance.id, context);
        const completeAction = actions.find(a => a.name.toLowerCase().includes('complete'));
        if (!completeAction) throw new Error('No complete action available');
        
        return this.workflowEngine.executeTransition(workflowContext, completeAction, context, workflowParams.metadata);
        
      case 'cancel':
        // Get workflow instance and execute transition
        const cancelInstance = await this.prisma.workflow_instance.findFirst({
          where: { model_id: workflowParams.modelId }
        });
        if (!cancelInstance) throw new Error('No workflow instance found');
        
        const cancelContext = await this.workflowEngine.getWorkflowContext(cancelInstance.id, context || '');
        const cancelActions = await this.workflowEngine.getAvailableActions(cancelInstance.id, context || '');
        const cancelAction = cancelActions.find(a => a.name.toLowerCase().includes('cancel'));
        if (!cancelAction) throw new Error('No cancel action available');
        
        return this.workflowEngine.executeTransition(cancelContext, cancelAction, context || '', workflowParams.metadata);
        
      default:
        throw new Error(`Unsupported workflow action: ${action}`);
    }
  }
  
  /**
   * Check if a function name represents a workflow action
   */
  private isWorkflowAction(functionName: string): boolean {
    return /^(start|complete|cancel)[A-Z][a-zA-Z]+Workflow$/.test(functionName);
  }
  
  /**
   * Convert camelCase to snake_case
   */
  private camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, (letter, index) => index === 0 ? letter.toLowerCase() : `_${letter.toLowerCase()}`);
  }
} 