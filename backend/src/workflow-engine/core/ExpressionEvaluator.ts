import { WorkflowPrismaClient } from '../types/prisma.types';
import { ModelContext } from '../types/model.types';
import { PrismaClient } from '@prisma/client';

type PrismaClientWithIndex = WorkflowPrismaClient & {
  [key: string]: any;
};

export class ExpressionEvaluator {
  private prisma: PrismaClientWithIndex;

  constructor(prisma: WorkflowPrismaClient) {
    this.prisma = prisma as PrismaClientWithIndex;
  }

  async evaluateExpression(
    expression: string,
    context: ModelContext
  ): Promise<string | null> {
    // Split the expression into parts
    const parts = expression.split('.');
    
    // Get the base model instance
    const prismaClient = this.prisma as unknown as PrismaClient;
    const modelInstance = await (prismaClient as any)[context.modelType].findUnique({
      where: { id: context.modelId, org_id: context.orgId }
    });
    
    if (!modelInstance) {
      return null;
    }

    // Start with the base value
    let currentValue: any = modelInstance[parts[0] as keyof typeof modelInstance];    
    
    // Follow the relationship path
    for (let i = 1; i < parts.length; i++) {
      if (!currentValue) {
        return null;
      }
      
      const relationship = parts[i];

      // Handle special cases
    
    if (relationship === 'manager' && parts[0] === 'created_by') {
      // Get the user with their manager
      const user = await this.prisma.user.findUnique({
        where: { id: currentValue, org_id: context.orgId },
        select: {
          id: true,
          email: true,
          name: true,
          manager_id: true
        }
      });

      if (user?.manager_id) {        
        return user.manager_id;
      }
      return null;
    }
      currentValue = await this.followRelationship(currentValue, relationship);
    }

    return currentValue?.id || null;
  }

  private async followRelationship(value: any, relationship: string) {

    // Handle direct relationships
    if (value[relationship]) {
      return value[relationship];
    }

    // Handle nested relationships
    const modelName = this.getModelName(value);
    const prismaClient = this.prisma as unknown as PrismaClient;    
    if (modelName in prismaClient) {
      const relatedModel = await (prismaClient as any)[modelName].findUnique({
        where: { id: value.id },
        include: { [relationship]: true }
      });
      return relatedModel?.[relationship];
    }

    return null;
  }

  private getModelName(value: any): string {
    // Extract model name from the value's type or structure
    return value.__typename?.toLowerCase() || 'user';
  }
} 