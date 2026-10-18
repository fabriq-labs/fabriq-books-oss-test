/**
 * Import Extensions Initialization
 *
 * This module initializes and registers all import extensions.
 * Call initializeImportExtensions() once at application startup.
 */

import { registerDomainImportExtensions } from '@/domain/register';

/** Ask the domain to register its import extensions. The kernel has none of its own. */
export function initializeImportExtensions(): void {
  registerDomainImportExtensions();
}
