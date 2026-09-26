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

// Import registry and extensions
import { ImportExtensionRegistry } from './registry';
import { PostingImportExtension } from './posting';

/**
 * Initialize and register all import extensions.
 * Idempotent — safe to call from server boot and from ModelService in tests.
 */
export function initializeImportExtensions(): void {
  const registry = ImportExtensionRegistry.getInstance();

  if (registry.hasExtension('posting')) {
    return;
  }

  // Register posting extension (bank statement categorization)
  registry.register(new PostingImportExtension());

  // Add other extensions here as they're created
  // registry.register(new InvoiceImportExtension());
}
