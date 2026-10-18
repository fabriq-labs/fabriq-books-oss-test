import { Prisma } from '@prisma/client';
import prisma from '../../src/lib/prisma';

export class OpeningBalanceError extends Error {}

export type OpeningLine = {
  account_id?: string;
  debit?: string | number | null;
  credit?: string | number | null;
};

export type OpeningBalanceInput = {
  entity_id?: string;
  as_of?: string;
  lines?: OpeningLine[];
};

type Side = {
  account_id: string;
  left: Prisma.Decimal;
};

type Pair = {
  debit_account_id: string;
  credit_account_id: string;
  amount: Prisma.Decimal;
};

const DUST = new Prisma.Decimal('0.00005');

function money(value: string | number | null | undefined): Prisma.Decimal {
  if (value == null || value === '') return new Prisma.Decimal(0);
  try {
    return new Prisma.Decimal(value);
  } catch {
    throw new OpeningBalanceError('Amount is not a number');
  }
}

function pairGroup(debits: Side[], credits: Side[]): Pair[] {
  const pairs: Pair[] = [];
  let i = 0;
  let j = 0;
  while (i < debits.length && j < credits.length) {
    if (debits[i].left.lessThanOrEqualTo(0) || credits[j].left.lessThanOrEqualTo(0)) break;
    const amount = debits[i].left.lessThan(credits[j].left) ? debits[i].left : credits[j].left;
    pairs.push({
      debit_account_id: debits[i].account_id,
      credit_account_id: credits[j].account_id,
      amount,
    });
    debits[i].left = debits[i].left.minus(amount);
    credits[j].left = credits[j].left.minus(amount);
    if (debits[i].left.lessThanOrEqualTo(DUST)) i += 1;
    if (credits[j].left.lessThanOrEqualTo(DUST)) j += 1;
  }
  return pairs;
}

export async function saveOpeningBalances(
  orgId: string,
  userId: string | undefined,
  input: OpeningBalanceInput
): Promise<{ postings_created: number; posting_ids: string[] }> {
  const entityId = input.entity_id?.trim() ?? '';
  const asOf = input.as_of?.trim() ?? '';
  if (!entityId) throw new OpeningBalanceError('entity_id is required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new OpeningBalanceError('as_of must be YYYY-MM-DD');

  const entity = await prisma.entity.findFirst({
    where: { id: entityId, org_id: orgId },
    select: { id: true },
  });
  if (!entity) throw new OpeningBalanceError('Entity not found');

  const lines = input.lines ?? [];
  if (lines.length === 0) throw new OpeningBalanceError('Enter at least one debit and one credit');

  const accountIds = [...new Set(lines.map((line) => line.account_id?.trim()).filter((id): id is string => !!id))];
  const accounts = await prisma.account.findMany({
    where: { org_id: orgId, id: { in: accountIds } },
    select: { id: true, currency_id: true, name: true },
  });
  const byId = new Map(accounts.map((account) => [account.id, account]));

  const groups = new Map<string, { debits: Side[]; credits: Side[]; debit: Prisma.Decimal; credit: Prisma.Decimal }>();

  for (const line of lines) {
    const accountId = line.account_id?.trim() ?? '';
    if (!accountId) continue;
    const account = byId.get(accountId);
    if (!account) throw new OpeningBalanceError('Account not found in this organization');
    const debit = money(line.debit);
    const credit = money(line.credit);
    if (debit.lessThan(0) || credit.lessThan(0)) throw new OpeningBalanceError('Amounts must be positive');
    if (debit.greaterThan(0) && credit.greaterThan(0)) {
      throw new OpeningBalanceError('A line is either a debit or a credit');
    }
    if (debit.isZero() && credit.isZero()) continue;
    const key = account.currency_id ?? '';
    const group = groups.get(key) ?? {
      debits: [],
      credits: [],
      debit: new Prisma.Decimal(0),
      credit: new Prisma.Decimal(0),
    };
    if (debit.greaterThan(0)) {
      group.debits.push({ account_id: accountId, left: debit });
      group.debit = group.debit.plus(debit);
    } else {
      group.credits.push({ account_id: accountId, left: credit });
      group.credit = group.credit.plus(credit);
    }
    groups.set(key, group);
  }

  if (groups.size === 0) throw new OpeningBalanceError('Enter at least one debit and one credit');

  const pairs: Pair[] = [];
  for (const group of groups.values()) {
    if (!group.debit.equals(group.credit)) {
      throw new OpeningBalanceError('Debit and credit totals must match in the account currency');
    }
    pairs.push(...pairGroup(group.debits.map((side) => ({ ...side })), group.credits.map((side) => ({ ...side }))));
  }

  const when = new Date(`${asOf}T00:00:00.000Z`);
  const dayEnd = new Date(`${asOf}T23:59:59.999Z`);

  const created = await prisma.$transaction(async (tx) => {
    await tx.posting.deleteMany({
      where: {
        org_id: orgId,
        entity_id: entityId,
        kind: 'opening',
        value_date: { gte: when, lte: dayEnd },
      },
    });
    const ids: string[] = [];
    for (const pair of pairs) {
      const row = await tx.posting.create({
        data: {
          org_id: orgId,
          debit_account_id: pair.debit_account_id,
          credit_account_id: pair.credit_account_id,
          amount: pair.amount.toFixed(4),
          kind: 'opening',
          status: 'active',
          entity_id: entityId,
          value_date: when,
          posting_date: when,
          name: 'Opening balance',
          description: 'Opening balance',
          created_by: userId,
        },
        select: { id: true },
      });
      ids.push(row.id);
    }
    return ids;
  });

  return { postings_created: created.length, posting_ids: created };
}
