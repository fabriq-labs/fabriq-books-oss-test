import { ERPMethodHandler } from './types';
import logger from '../../../utils/logger';

// Import all handlers
import { getPurchaseOrderHandler } from './getPurchaseOrder';
import { getExpenseAccountsHandler } from './getExpenseAccounts';
import { getSystemTypeHandler } from './getSystemType';
import { categorizeTransactionHandler } from './categorizeTransaction';
import { categorizeTransactionBatchHandler } from './categorizeTransactionBatch';

/**
 * Registry of all ERP method handlers
 * To add a new method:
 * 1. Create a handler file in this directory
 * 2. Import it above
 * 3. Add it to this array
 */
const handlers: ERPMethodHandler[] = [
    getPurchaseOrderHandler,
    getExpenseAccountsHandler,
    getSystemTypeHandler,
    categorizeTransactionHandler,
    categorizeTransactionBatchHandler,
];

/**
 * Map of method name to handler
 * Populated on first access for fast lookup
 */
let handlerMap: Map<string, ERPMethodHandler> | null = null;

/**
 * Initialize the handler map from the handlers array
 */
function initializeHandlerMap(): void {
    if (handlerMap === null) {
        handlerMap = new Map();
        handlers.forEach((handler) => {
            if (handlerMap) {
                handlerMap.set(handler.method, handler);
            }
        });
        logger.debug('ERP handler registry initialized', {
            methodCount: handlers.length,
            methods: handlers.map((h) => h.method),
        });
    }
}

/**
 * Get a handler for a specific method
 * @param methodName - The method name (e.g., 'getPurchaseOrder')
 * @returns The handler for the method, or undefined if not found
 */
export function getHandler(methodName: string): ERPMethodHandler | undefined {
    initializeHandlerMap();
    return handlerMap?.get(methodName);
}

/**
 * Get all registered method names
 * Useful for validation and documentation
 * @returns Array of all registered method names
 */
export function getAllMethodNames(): string[] {
    initializeHandlerMap();
    return Array.from(handlerMap?.keys() || []);
}

/**
 * Check if a method has a handler
 * @param methodName - The method name to check
 * @returns True if a handler exists for this method
 */
export function hasHandler(methodName: string): boolean {
    initializeHandlerMap();
    return handlerMap?.has(methodName) || false;
}

