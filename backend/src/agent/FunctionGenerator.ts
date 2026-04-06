import { PrismaClient } from '@prisma/client';
import { FunctionDefinition } from './models/ModelProvider';
import { PermissionService } from '../services/permissions/PermissionService';
import logger from '../utils/logger';
import { GENERIC_FUNCTIONS } from './GenericFunctions';
import { ModelRegistry } from '../services/registry/ModelRegistry';

/**
 * Utility for generating function definitions from Prisma schema and workflow definitions
 */
export class FunctionGenerator {
  private prisma: PrismaClient;
  
  constructor() {
    this.prisma = new PrismaClient();
  }
  
  /**
   * Generate function definitions for a user
   */
  async generateForUser(userId: string, orgId: string): Promise<FunctionDefinition[]> {
    logger.debug('Generating functions for user', { userId, orgId });
    
    // Get user permissions
    const permissions = await PermissionService.getUserPermissions(userId);
    
    // Get accessible models from registry
    const accessibleModels = ModelRegistry.getInstance().getAccessibleModels(permissions);
    
    logger.debug('Generated functions with accessible models', { 
      userId,
      accessibleModels: accessibleModels.map(m => m.name)
    });
    
    // Return generic functions - they will work with any accessible model
    return GENERIC_FUNCTIONS;
  }
} 