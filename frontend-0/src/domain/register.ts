/**
 * Domain UI registration. The kernel calls this at startup.
 * A todo app and the ledger export the same function and fill the body.
 */
import { importExtensionRegistry } from '@/features/import-extensions/registry';
import { postingImportExtension } from '@/domain/gl/postingImportExtension';

export function registerDomainImportExtensions(): void {
  importExtensionRegistry.register(postingImportExtension);
}
