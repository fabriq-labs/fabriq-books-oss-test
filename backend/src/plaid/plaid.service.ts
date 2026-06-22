import { encryptConfig, decryptConfig } from '../lib/integrations/shared/encryption';
import prisma from '../lib/prisma';
import logger from '../utils/logger';
import { AuthContext } from '../auth/types';
import { UploadService } from '../services/upload/UploadService';
import { buildPostingImportFieldMapping } from '../lib/import/bankStatementImportClient';
import {
  getPlaidClient,
  isPlaidConfigured,
  PLAID_COUNTRY_CODES,
  PLAID_PRODUCTS,
} from './plaid.client';
import { mapPlaidTransactionToPosting, plaidTransactionNote } from './plaid.mapper';
import type { PlaidItemSummary, PlaidSyncResult, StoredPlaidAccount } from './plaid.types';
import { parseStoredAccounts } from './plaid.types';
import type { Transaction } from 'plaid';

const POSTING_VIEW = 'posting_view';

function encryptAccessToken(token: string): string {
  return encryptConfig({ access_token: token });
}

function decryptAccessToken(encrypted: string): string {
  const parsed = decryptConfig(encrypted);
  if (typeof parsed?.access_token !== 'string') {
    throw new Error('Invalid encrypted Plaid access token');
  }
  return parsed.access_token;
}

function getWebhookUrl(): string | undefined {
  const url = process.env.PLAID_WEBHOOK_URL?.trim();
  return url || undefined;
}

export class PlaidService {
  private static instance: PlaidService;

  static getInstance(): PlaidService {
    if (!PlaidService.instance) {
      PlaidService.instance = new PlaidService();
    }
    return PlaidService.instance;
  }

  assertConfigured(): void {
    if (!isPlaidConfigured()) {
      throw new Error('Plaid is not configured. Set PLAID_CLIENT_ID and PLAID_SECRET.');
    }
  }

  async createLinkToken(userId: string, orgId: string): Promise<string> {
    this.assertConfigured();
    const client = getPlaidClient();
    const response = await client.linkTokenCreate({
      user: { client_user_id: userId },
      client_name: 'Fabriq',
      products: PLAID_PRODUCTS,
      country_codes: PLAID_COUNTRY_CODES,
      language: 'en',
      webhook: getWebhookUrl(),
    });
    logger.info('Plaid link token created', { userId, orgId });
    return response.data.link_token;
  }

  async exchangePublicToken(
    publicToken: string,
    auth: AuthContext,
    metadata?: { institution?: { institution_id?: string; name?: string } },
  ): Promise<PlaidItemSummary> {
    this.assertConfigured();
    const client = getPlaidClient();
    const { user } = auth;

    const exchange = await client.itemPublicTokenExchange({ public_token: publicToken });
    const accessToken = exchange.data.access_token;
    const itemId = exchange.data.item_id;

    const existing = await prisma.plaid_item.findUnique({ where: { item_id: itemId } });
    if (existing && existing.org_id !== user.org_id) {
      throw new Error('This bank connection is already linked to another organization.');
    }

    const institutionId = metadata?.institution?.institution_id ?? null;
    const institutionName = metadata?.institution?.name ?? null;

    const item = existing
      ? await prisma.plaid_item.update({
          where: { id: existing.id },
          data: {
            access_token: encryptAccessToken(accessToken),
            institution_id: institutionId,
            institution_name: institutionName,
            modified_by: user.id,
          },
        })
      : await prisma.plaid_item.create({
          data: {
            org_id: user.org_id,
            user_id: user.id,
            institution_id: institutionId,
            institution_name: institutionName,
            access_token: encryptAccessToken(accessToken),
            item_id: itemId,
            created_by: user.id,
            modified_by: user.id,
          },
        });

    await this.refreshPlaidAccounts(item.id, accessToken);

    // Initial sync is best-effort — user must map accounts first
    try {
      await this.syncItemById(item.id, auth);
    } catch (err) {
      logger.warn('Plaid initial sync skipped or failed after link', { itemId: item.id, err });
    }

    return this.getItemSummary(item.id, user.org_id);
  }

  async listItems(orgId: string): Promise<PlaidItemSummary[]> {
    const items = await prisma.plaid_item.findMany({
      where: { org_id: orgId },
      orderBy: { created_at: 'desc' },
    });
    return items.map((item) => this.toItemSummary(item));
  }

  async getItemSummary(itemDbId: string, orgId: string): Promise<PlaidItemSummary> {
    const item = await prisma.plaid_item.findFirst({
      where: { id: itemDbId, org_id: orgId },
    });
    if (!item) {
      throw new Error('Plaid connection not found');
    }
    return this.toItemSummary(item);
  }

  async updateAccountMapping(
    itemDbId: string,
    plaidAccountId: string,
    fabriqAccountId: string | null,
    orgId: string,
  ): Promise<void> {
    const item = await prisma.plaid_item.findFirst({
      where: { id: itemDbId, org_id: orgId },
    });
    if (!item) {
      throw new Error('Plaid connection not found');
    }

    const accounts = parseStoredAccounts(item.accounts);
    const idx = accounts.findIndex((a) => a.plaid_account_id === plaidAccountId);
    if (idx === -1) {
      throw new Error('Plaid account not found on this connection');
    }

    accounts[idx] = { ...accounts[idx], fabriq_account_id: fabriqAccountId };
    await prisma.plaid_item.update({
      where: { id: itemDbId },
      data: { accounts },
    });
  }

  async deleteItem(itemDbId: string, orgId: string): Promise<void> {
    const item = await prisma.plaid_item.findFirst({
      where: { id: itemDbId, org_id: orgId },
    });
    if (!item) {
      throw new Error('Plaid connection not found');
    }

    if (isPlaidConfigured()) {
      try {
        const accessToken = decryptAccessToken(item.access_token);
        await getPlaidClient().itemRemove({ access_token: accessToken });
      } catch (err) {
        logger.warn('Plaid itemRemove failed; deleting local record anyway', {
          itemDbId,
          err,
        });
      }
    }

    await prisma.plaid_item.delete({ where: { id: itemDbId } });
  }

  async syncItemById(itemDbId: string, auth: AuthContext): Promise<PlaidSyncResult> {
    const item = await prisma.plaid_item.findFirst({
      where: { id: itemDbId, org_id: auth.user.org_id },
    });
    if (!item) {
      throw new Error('Plaid connection not found');
    }
    return this.syncItemRecord(item, auth);
  }

  async syncItemByPlaidItemId(plaidItemId: string): Promise<PlaidSyncResult | null> {
    const item = await prisma.plaid_item.findFirst({
      where: { item_id: plaidItemId },
    });
    if (!item) {
      return null;
    }

    const auth: AuthContext = {
      user: {
        id: item.user_id,
        org_id: item.org_id,
        email: '',
        name: null,
      },
    };
    return this.syncItemRecord(item, auth);
  }

  private async syncItemRecord(
    item: {
      id: string;
      org_id: string;
      access_token: string;
      cursor: string | null;
      accounts: unknown;
    },
    auth: AuthContext,
  ): Promise<PlaidSyncResult> {
    this.assertConfigured();
    const accessToken = decryptAccessToken(item.access_token);
    const client = getPlaidClient();

    const accountMap = new Map<string, string>();
    for (const acct of parseStoredAccounts(item.accounts)) {
      if (acct.fabriq_account_id) {
        accountMap.set(acct.plaid_account_id, acct.fabriq_account_id);
      }
    }

    if (accountMap.size === 0) {
      throw new Error(
        'No Fabriq bank accounts mapped. Map at least one Plaid account before syncing.',
      );
    }

    let cursor = item.cursor ?? undefined;
    let hasMore = true;
    const toInsert: Record<string, unknown>[] = [];
    let added = 0;
    let modified = 0;
    let removed = 0;
    let skipped = 0;

    while (hasMore) {
      const response = await client.transactionsSync({
        access_token: accessToken,
        cursor,
      });

      const { added: addedTxns, modified: modifiedTxns, removed: removedTxns, next_cursor, has_more } =
        response.data;

      for (const tx of [...addedTxns, ...modifiedTxns] as Transaction[]) {
        const bankAccountId = accountMap.get(tx.account_id);
        if (!bankAccountId) {
          skipped++;
          continue;
        }

        const note = plaidTransactionNote(tx.transaction_id);
        const existing = await prisma.posting.findFirst({
          where: { org_id: item.org_id, notes: note },
          select: { id: true },
        });
        if (existing) {
          skipped++;
          continue;
        }

        toInsert.push(mapPlaidTransactionToPosting(tx, bankAccountId, item.org_id));
        if (addedTxns.some((t) => t.transaction_id === tx.transaction_id)) {
          added++;
        } else {
          modified++;
        }
      }

      removed += removedTxns.length;
      cursor = next_cursor;
      hasMore = has_more;
    }

    if (toInsert.length > 0) {
      const mapping = buildPostingImportFieldMapping(toInsert);
      const uploadResult = await UploadService.getInstance().uploadCSV(
        'posting',
        auth,
        { data: toInsert, mapping },
        POSTING_VIEW,
      );
      if (!uploadResult.success) {
        throw new Error(uploadResult.error ?? 'Failed to import Plaid transactions');
      }
    }

    await prisma.plaid_item.update({
      where: { id: item.id },
      data: { cursor: cursor ?? null, last_synced_at: new Date() },
    });

    logger.info('Plaid sync complete', {
      itemId: item.id,
      added,
      modified,
      removed,
      skipped,
      inserted: toInsert.length,
    });

    return { added, modified, removed, skipped };
  }

  private async refreshPlaidAccounts(itemDbId: string, accessToken: string): Promise<void> {
    const item = await prisma.plaid_item.findUnique({ where: { id: itemDbId } });
    if (!item) return;

    const client = getPlaidClient();
    const response = await client.accountsGet({ access_token: accessToken });
    const existing = parseStoredAccounts(item.accounts);
    const mappingByPlaidId = new Map(
      existing.map((a) => [a.plaid_account_id, a.fabriq_account_id]),
    );

    const accounts: StoredPlaidAccount[] = response.data.accounts.map((acct) => ({
      plaid_account_id: acct.account_id,
      name: acct.name ?? null,
      mask: acct.mask ?? null,
      type: acct.type ?? null,
      subtype: acct.subtype ?? null,
      fabriq_account_id: mappingByPlaidId.get(acct.account_id) ?? null,
    }));

    await prisma.plaid_item.update({
      where: { id: itemDbId },
      data: { accounts },
    });
  }

  private toItemSummary(item: {
    id: string;
    item_id: string;
    institution_id: string | null;
    institution_name: string | null;
    last_synced_at: Date | null;
    created_at: Date;
    accounts: unknown;
  }): PlaidItemSummary {
    return {
      id: item.id,
      item_id: item.item_id,
      institution_id: item.institution_id,
      institution_name: item.institution_name,
      last_synced_at: item.last_synced_at?.toISOString() ?? null,
      created_at: item.created_at.toISOString(),
      accounts: parseStoredAccounts(item.accounts),
    };
  }
}
