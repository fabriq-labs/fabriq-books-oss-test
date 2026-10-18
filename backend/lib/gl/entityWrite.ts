import prisma from '../../src/lib/prisma';

/**
 * At most one entity per organization may have is_headquarters true.
 * The partial unique index is the backstop. This guard rejects the write
 * with a readable error before Postgres does.
 */
const MESSAGE = 'Invalid headquarters: only one headquarters entity is allowed for an organization';

type MiddlewareParams = {
  model?: string;
  action: string;
  args?: {
    data?: Record<string, unknown> | Array<Record<string, unknown>>;
    where?: { id?: string };
  };
};

let installed = false;

function wantsHeadquarters(data: Record<string, unknown> | undefined): boolean {
  return data?.is_headquarters === true;
}

async function headquartersConflict(params: MiddlewareParams): Promise<string | null> {
  const data = params.args?.data;
  if (!data || Array.isArray(data) || !wantsHeadquarters(data)) return null;

  const whereId = params.args?.where?.id;
  let orgId = typeof data.org_id === 'string' ? data.org_id : undefined;
  if (!orgId && whereId) {
    const current = await prisma.entity.findUnique({
      where: { id: whereId },
      select: { org_id: true },
    });
    orgId = current?.org_id;
  }
  if (!orgId) return null;

  const other = await prisma.entity.findFirst({
    where: {
      org_id: orgId,
      is_headquarters: true,
      ...(whereId ? { id: { not: whereId } } : {}),
    },
    select: { id: true },
  });
  return other ? MESSAGE : null;
}

export function installEntityWriteGuard(): void {
  if (installed) return;
  const client = prisma as typeof prisma & {
    $use?: (
      fn: (params: MiddlewareParams, next: (params: MiddlewareParams) => Promise<unknown>) => Promise<unknown>
    ) => void;
  };
  if (typeof client.$use !== 'function') return;
  installed = true;
  client.$use(async (params, next) => {
    if (params.model === 'entity' && (params.action === 'create' || params.action === 'update')) {
      const message = await headquartersConflict(params);
      if (message) throw new Error(message);
    }
    return next(params);
  });
}
