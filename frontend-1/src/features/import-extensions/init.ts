/**
 * Import Extensions Initialization
 *
 * This module initializes and registers all import extensions.
 * Call initializeImportExtensions() once at application startup.
 */

import { importExtensionRegistry } from './registry';
import { postingImportExtension } from './posting';

/**
 * Initialize and register all import extensions
 */
export function initializeImportExtensions(): void {
  // Register posting extension (bank statement categorization)
  importExtensionRegistry.register(postingImportExtension);

  // Add other extensions here as they're created
  // importExtensionRegistry.register(invoiceImportExtension);

  console.log('[ImportExtensions] Initialized all import extensions');
}
