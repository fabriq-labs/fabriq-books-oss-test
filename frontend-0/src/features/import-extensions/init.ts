/**
 * Import Extensions Initialization
 *
 * This module initializes and registers all import extensions.
 * Call initializeImportExtensions() once at application startup.
 */

import { postingImportExtension } from '@/domain/gl/postingImportExtension';
import { importExtensionRegistry } from './registry';

/**
 * Domain import extensions register here. The kernel ships with none of its own.
 */
export function initializeImportExtensions(): void {
  importExtensionRegistry.register(postingImportExtension);
}
