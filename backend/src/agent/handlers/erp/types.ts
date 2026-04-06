import { AuthContext } from '../../../auth/types';
import { ERPConnector } from '../../../lib/integrations/connectors/types';

/**
 * Interface for ERP method handlers
 * Each handler implements this interface to handle a specific ERP connector method
 */
export interface ERPMethodHandler {
  /**
   * The method name this handler handles (e.g., 'getPurchaseOrder', 'getExpenseAccounts')
   */
  method: string;

  /**
   * Validate and prepare parameters for the method
   * Can throw errors if validation fails
   * @param params - Parameters provided by the AI
   * @param context - Context from the request (may include recordId, modelName, etc.)
   * @param auth - Authentication context
   * @returns Validated and potentially transformed parameters
   */
  validateParams(params?: any, context?: any, auth?: AuthContext): any;

  /**
   * Execute the ERP connector method
   * @param connector - The ERP connector instance
   * @param params - Validated parameters (from validateParams)
   * @param context - Context from the request
   * @param auth - Authentication context
   * @returns The result from the ERP connector method
   */
  execute(
    connector: ERPConnector,
    params: any,
    context?: any,
    auth?: AuthContext
  ): Promise<any>;

  /**
   * Whether this method requires context (e.g., context.recordId)
   * Used for validation and documentation
   */
  requiresContext?: boolean;

  /**
   * Description of what this method does (for AI prompts and documentation)
   */
  description?: string;
}

