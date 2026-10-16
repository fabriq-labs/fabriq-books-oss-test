/**
 * Import Extensions Module
 *
 * This module provides a registry pattern for model-specific import functionality.
 * Extensions can be registered to customize extraction, post-processing, and other
 * import-time behaviors without modifying generic components.
 *
 * Usage:
 * ```typescript
 * import { ImportExtensionRegistry } from './lib/import-extensions';
 *
 * const registry = ImportExtensionRegistry.getInstance();
 * const extension = registry.getForModel('posting');
 *
 * if (extension?.customExtract) {
 *   const result = await extension.customExtract(context, buffer, options);
 * }
 * ```
 */

export * from './types';
export { ImportExtensionRegistry } from './registry';

/**
 * Register domain import extensions from backend/src/domain when a domain adds them.
 */
export function initializeImportExtensions(): void {
}
