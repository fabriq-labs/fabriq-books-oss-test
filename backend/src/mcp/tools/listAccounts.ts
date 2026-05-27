import { z } from 'zod';
import { AuthContext } from '../../auth/types';
import prisma from '../../lib/prisma';

export const listAccountsSchema = {
  name: z
    .string()
    .optional()
    .describe('Partial account name — case-insensitive contains search.'),
  code: z
    .string()
    .optional()
    .describe('Exact account code — case-insensitive equals search.'),
};

export type ListAccountsParams = z.infer<z.ZodObject<typeof listAccountsSchema>>;

export interface AccountResult {
  id: string;
  code: string | null;
  name: string | null;
  type: string[];
  sub_type: string | null;
  classification: string | null;
  currency: unknown;
  legal_entity_id: string | null;
  legal_entity_name: string | null;
  is_active: boolean;
}

export interface ListAccountsResult {
  accounts: AccountResult[];
  total: number;
}

export function listAccountsHandler(auth: AuthContext) {
  return async (params: ListAccountsParams): Promise<ListAccountsResult> => {
    const orgId = auth.user?.org_id;
    if (!orgId) throw new Error('Auth context missing org_id');

    const where: Record<string, any> = { org_id: orgId };

    if (params.name) {
      where.name = { contains: params.name, mode: 'insensitive' };
    }
    if (params.code) {
      where.code = { equals: params.code, mode: 'insensitive' };
    }

    const accounts = await prisma.account.findMany({
      where,
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
        sub_type: true,
        classification: true,
        currency: true,
        legal_entity_id: true,
        legal_entity: {
          select: {
            legal_name: true,
            organization_name: true,
            name: true,
          },
        },
        is_active: true,
      },
      orderBy: [{ code: 'asc' }, { name: 'asc' }],
      take: 10,
    });

    return {
      accounts: accounts.map((account) => ({
        id: account.id,
        code: account.code,
        name: account.name,
        type: account.type,
        sub_type: account.sub_type,
        classification: account.classification,
        currency: account.currency,
        legal_entity_id: account.legal_entity_id,
        legal_entity_name:
          account.legal_entity?.legal_name ??
          account.legal_entity?.organization_name ??
          account.legal_entity?.name ??
          null,
        is_active: account.is_active,
      })),
      total: accounts.length,
    };
  };
}
