import { PrismaClient, Prisma } from '@prisma/client';
import logger from '../../utils/logger';

// Models that must NOT have org_id injected (global / cross-tenant data).
const GLOBAL_MODELS = new Set([
  'role',
  'workflow_flow',
  'workflow_state',
  'workflow_action',
  'view',
  'permission',
  'role_view',
  'prompt_template',
  'currency',
]);

type PrismaClientOrTx = PrismaClient | Prisma.TransactionClient;

/**
 * SystemDataLayer — a privilege-level database accessor for internal/batch
 * operations that must NOT go through view-based permission filtering.
 *
 * Guarantees:
 *   - org_id is injected on every write and prepended to every WHERE.
 *   - created_by / modified_by are set from the supplied userId.
 *   - No PermissionService filtering.
 *   - No execute_Action / workflow triggers.
 *
 * Usage:
 *   const sdl = new SystemDataLayer(prisma, orgId, userId);
 *   await sdl.transaction(async (tx) => {
 *     await tx.deleteMany('posting', { posting_type: 'X' });
 *     await tx.createMany('posting', rows);
 *   });
 */
export class SystemDataLayer {
  private readonly client: PrismaClientOrTx;
  readonly orgId: string;
  readonly userId: string;

  constructor(client: PrismaClientOrTx, orgId: string, userId: string) {
    this.client = client;
    this.orgId = orgId;
    this.userId = userId;
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private model(name: string) {
    const m = (this.client as any)[name.toLowerCase()];
    if (!m) throw new Error(`Model "${name}" not found in Prisma client`);
    return m;
  }

  private scopedWhere(model: string, where: object = {}): object {
    if (GLOBAL_MODELS.has(model.toLowerCase())) return where;
    return { ...where, org_id: this.orgId };
  }

  private writeDefaults(isCreate: boolean): object {
    return isCreate
      ? { created_by: this.userId, modified_by: this.userId, org_id: this.orgId }
      : { modified_by: this.userId };
  }

  // ── Read operations ───────────────────────────────────────────────────────

  async findFirst<T = any>(
    model: string,
    where: object = {},
    options: { select?: object; include?: object; orderBy?: object } = {}
  ): Promise<T | null> {
    logger.debug('SystemDataLayer.findFirst', { model, where });
    return this.model(model).findFirst({ where: this.scopedWhere(model, where), ...options });
  }

  async findUnique<T = any>(
    model: string,
    where: object,
    options: { select?: object; include?: object } = {}
  ): Promise<T | null> {
    logger.debug('SystemDataLayer.findUnique', { model, where });
    return this.model(model).findUnique({ where, ...options });
  }

  async findMany<T = any>(
    model: string,
    where: object = {},
    options: { select?: object; include?: object; orderBy?: object; take?: number; skip?: number } = {}
  ): Promise<T[]> {
    logger.debug('SystemDataLayer.findMany', { model, where });
    return this.model(model).findMany({ where: this.scopedWhere(model, where), ...options });
  }

  async groupBy<T = any>(
    model: string,
    options: { by: string[]; where?: object; _count?: object; _sum?: object; orderBy?: object }
  ): Promise<T[]> {
    logger.debug('SystemDataLayer.groupBy', { model });
    const { where = {}, ...rest } = options;
    return this.model(model).groupBy({ where: this.scopedWhere(model, where), ...rest });
  }

  // ── Write operations ──────────────────────────────────────────────────────

  async create<T = any>(model: string, data: object): Promise<T> {
    logger.debug('SystemDataLayer.create', { model });
    return this.model(model).create({ data: { ...data, ...this.writeDefaults(true) } });
  }

  async upsert<T = any>(
    model: string,
    args: { where: object; create: object; update: object; select?: object }
  ): Promise<T> {
    logger.debug('SystemDataLayer.upsert', { model });
    return this.model(model).upsert({
      where: args.where,
      create: { ...args.create, ...this.writeDefaults(true) },
      update: { ...args.update, ...this.writeDefaults(false) },
      ...(args.select && { select: args.select }),
    });
  }

  async createMany(model: string, data: object[]): Promise<{ count: number }> {
    logger.debug('SystemDataLayer.createMany', { model, count: data.length });
    const defaults = this.writeDefaults(true);
    return this.model(model).createMany({
      data: data.map((row) => ({ ...row, ...defaults })),
    });
  }

  async deleteMany(model: string, where: object = {}): Promise<{ count: number }> {
    logger.debug('SystemDataLayer.deleteMany', { model, where });
    return this.model(model).deleteMany({ where: this.scopedWhere(model, where) });
  }

  // ── Transaction ───────────────────────────────────────────────────────────

  /**
   * Run a callback inside a Prisma transaction. The callback receives a new
   * SystemDataLayer instance wrapping the transaction client — use it for all
   * operations inside the transaction.
   */
  async transaction<T>(fn: (tx: SystemDataLayer) => Promise<T>): Promise<T> {
    // If already inside a transaction client (Prisma.TransactionClient does not
    // expose .$transaction), fall back to running the fn directly.
    if (typeof (this.client as any).$transaction !== 'function') {
      return fn(this);
    }
    return (this.client as PrismaClient).$transaction(async (txClient) => {
      return fn(new SystemDataLayer(txClient, this.orgId, this.userId));
    });
  }
}
