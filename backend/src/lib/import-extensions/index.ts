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

import { registerDomainImportExtensions } from '../../../lib/domain';

export * from './types';
export { ImportExtensionRegistry } from './registry';

/** Ask the domain to register its import extensions. The kernel has none of its own. */
export function initializeImportExtensions(): void {
  registerDomainImportExtensions();
}
