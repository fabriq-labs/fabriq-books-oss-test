import { Request, Response } from 'express';

export type CustomActionHandler = (req: Request, res: Response) => Promise<void>;

/**
 * Registry for custom /:model/custom/:action endpoints.
 *
 * Custom actions are registered at startup (e.g. via postingCustomActions.ts)
 * and dispatched by the single catch-all route in routes.ts that sits BEFORE
 * the auto-generated model loops — preventing Express from misrouting these
 * paths as /:id/:relation patterns.
 *
 * Usage:
 *   customActionRegistry.register('posting', 'import-bank-statement', handler);
 */

const registry = new Map<string, CustomActionHandler>();

function key(model: string, action: string): string {
  return `${model.toLowerCase()}::${action.toLowerCase()}`;
}

export const customActionRegistry = {
  register(model: string, action: string, handler: CustomActionHandler): void {
    registry.set(key(model, action), handler);
  },

  resolve(model: string, action: string): CustomActionHandler | undefined {
    return registry.get(key(model, action));
  },

  /** Returns all registered (model, action) pairs — useful for debugging. */
  list(): Array<{ model: string; action: string }> {
    return Array.from(registry.keys()).map((k) => {
      const [model, action] = k.split('::');
      return { model, action };
    });
  },
};
