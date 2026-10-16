import { ImportExtension } from './types';

/**
 * Import Extension Registry
 *
 * Singleton registry for model-specific import extensions.
 * Extensions provide custom UI components and behaviors for import flows
 * without modifying generic components.
 */
class ImportExtensionRegistryClass {
  private extensions: Map<string, ImportExtension> = new Map();

  /**
   * Register an import extension
   * @param extension - The extension to register
   */
  register(extension: ImportExtension): void {
    this.extensions.set(extension.targetModel.toLowerCase(), extension);
    console.log(`[ImportExtensionRegistry] Registered extension for: ${extension.targetModel}`);
  }

  /**
   * Get extension for a specific model
   * @param modelName - The model name (e.g., 'posting')
   */
  getForModel(modelName: string): ImportExtension | null {
    return this.extensions.get(modelName.toLowerCase()) || null;
  }

  /**
   * Check if a model has an extension registered
   * @param modelName - The model name to check
   */
  hasExtension(modelName: string): boolean {
    return this.extensions.has(modelName.toLowerCase());
  }

  /**
   * Get all registered extensions
   */
  getAllExtensions(): ImportExtension[] {
    return Array.from(this.extensions.values());
  }

  /**
   * Unregister an extension (mainly for testing)
   * @param modelName - The model name to unregister
   */
  unregister(modelName: string): boolean {
    return this.extensions.delete(modelName.toLowerCase());
  }
}

// Export singleton instance
export const importExtensionRegistry = new ImportExtensionRegistryClass();
