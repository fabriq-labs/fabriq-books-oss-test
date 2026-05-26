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
  currency: string | null;
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
        is_active: true,
      },
      orderBy: [{ code: 'asc' }, { name: 'asc' }],
      take: 10,
    });

    return {
      accounts: accounts as AccountResult[],
      total: accounts.length,
    };
  };
}
