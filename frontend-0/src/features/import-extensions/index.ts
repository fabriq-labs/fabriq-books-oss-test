/**
 * Import Extensions Module
 *
 * This module provides a registry pattern for model-specific import UI features.
 * Extensions can be registered to customize columns, toolbar actions, PDF handling,
 * and data transformations without modifying generic components.
 *
 * Usage:
 * ```typescript
 * import { importExtensionRegistry, initializeImportExtensions } from '@/features/import-extensions';
 *
 * // At app startup
 * initializeImportExtensions();
 *
 * // In components
 * const extension = importExtensionRegistry.getForModel('posting');
 * if (extension?.canActivate(modelType, csvData, mappings)) {
 *   const columns = extension.getColumns?.(state) || [];
 *   const toolbar = extension.renderToolbarActions?.(props);
 * }
 * ```
 */

export * from './types';
export { importExtensionRegistry } from './registry';
export { initializeImportExtensions } from './init';
