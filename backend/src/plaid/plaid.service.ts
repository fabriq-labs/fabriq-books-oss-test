import { encryptConfig, decryptConfig } from '../lib/integrations/shared/encryption';
import prisma from '../lib/prisma';
import logger from '../utils/logger';
import { AuthContext } from '../auth/types';
import {
  getPlaidClient,
  getPlaidEnv,
  isPlaidConfigured,
  PLAID_COUNTRY_CODES,
  PLAID_PRODUCTS,
} from './plaid.client';
import { mapPlaidTransactionToPosting, mapPlaidAccountToCoa, formatPlaidAccountName } from './plaid.mapper';
import type {
  PlaidItemSummary,
  PlaidSyncResult,
  PlaidImportAccountsResult,
  PlaidLinkAccountResult,
  StoredPlaidAccount,
} from './plaid.types';
import type { AccountBase, Transaction } from 'plaid';

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

  getConfig(): { env: string; skip_link_ui: boolean } {
    const env = getPlaidEnv();
    return { env, skip_link_ui: env === 'sandbox' };
  }

  async searchInstitutions(
    query: string,
  ): Promise<Array<{ institution_id: string; name: string; logo: string | null }>> {
    this.assertConfigured();
    const client = getPlaidClient();
    const trimmed = query.trim();

    const response = trimmed
      ? await client.institutionsSearch({
          query: trimmed,
          country_codes: PLAID_COUNTRY_CODES,
          products: PLAID_PRODUCTS,
          options: { include_optional_metadata: true },
        })
      : await client.institutionsGet({
          count: 20,
          offset: 0,
          country_codes: PLAID_COUNTRY_CODES,
          options: { include_optional_metadata: true, products: PLAID_PRODUCTS },
        });

    return response.data.institutions.map((inst) => ({
      institution_id: inst.institution_id,
      name: inst.name,
      logo: inst.logo ?? null,
    }));
  }

  async sandboxConnect(
    institutionId: string,
    institutionName: string | null,
    auth: AuthContext,
    legalEntityId?: string | null,
  ): Promise<PlaidItemSummary> {
    if (getPlaidEnv() !== 'sandbox') {
      throw new Error('Direct connect is only available in Plaid sandbox');
    }
    this.assertConfigured();
    const client = getPlaidClient();
    const response = await client.sandboxPublicTokenCreate({
      institution_id: institutionId,
      initial_products: PLAID_PRODUCTS,
    });
    return this.exchangePublicToken(response.data.public_token, auth, {
      institution: { institution_id: institutionId, name: institutionName ?? undefined },
      legal_entity_id: legalEntityId ?? undefined,
    });
  }

  private async resolveLegalEntityId(
    orgId: string,
    preferredId?: string | null,
  ): Promise<string | null> {
    if (preferredId) {
      const entity = await prisma.entity.findFirst({
        where: { id: preferredId, org_id: orgId },
        select: { id: true },
      });
      if (entity) return entity.id;
    }

    const hq = await prisma.entity.findFirst({
      where: { org_id: orgId, is_it_headquartres: 'Yes' },
      select: { id: true },
    });
    if (hq) return hq.id;

    const fallback = await prisma.entity.findFirst({
      where: { org_id: orgId },
      select: { id: true },
      orderBy: { created_at: 'asc' },
    });
    return fallback?.id ?? null;
  }

  private async resolveEntityForImport(
    orgId: string,
    preferredId?: string | null,
  ): Promise<{ legalEntityId: string | null; baseCurrencyId: string | null }> {
    const legalEntityId = await this.resolveLegalEntityId(orgId, preferredId);
    if (!legalEntityId) {
      return { legalEntityId: null, baseCurrencyId: null };
    }

    const entity = await prisma.entity.findFirst({
      where: { id: legalEntityId, org_id: orgId },
      select: { basecurrency_id: true },
    });

    return {
      legalEntityId,
      baseCurrencyId: entity?.basecurrency_id ?? null,
    };
  }

  /** Next numeric COA code for a Plaid bank account (11xx assets, 21xx liabilities). */
  private async generatePlaidAccountCode(
    orgId: string,
    legalEntityId: string,
    classification: 'Assets' | 'Liabilities',
  ): Promise<string> {
    const seriesPrefix = classification === 'Liabilities' ? '21' : '11';
    const accounts = await prisma.account.findMany({
      where: {
        org_id: orgId,
        legal_entity_id: legalEntityId,
        code: { startsWith: seriesPrefix },
      },
      select: { code: true },
    });

    let maxInSeries = parseInt(`${seriesPrefix}00`, 10) - 1;
    for (const row of accounts) {
      const digits = (row.code ?? '').replace(/\D/g, '');
      const num = parseInt(digits, 10);
      if (!Number.isNaN(num) && num > maxInSeries) {
        maxInSeries = num;
      }
    }

    let candidateNum = maxInSeries + 1;
    for (let attempt = 0; attempt < 500; attempt++) {
      const candidate = String(candidateNum);
      const exists = await prisma.account.findFirst({
        where: { org_id: orgId, legal_entity_id: legalEntityId, code: candidate },
        select: { id: true },
      });
      if (!exists) return candidate;
      candidateNum++;
    }

    throw new Error('Could not generate a unique account code for this bank account.');
  }

  async createLinkToken(userId: string, orgId: string): Promise<string> {
    this.assertConfigured();
    const client = getPlaidClient();
    // Do not pass institution_id — search IDs often fail link/token/create in production
    // (INVALID_INSTITUTION) even when returned by /institutions/search. User picks the bank in Link.
    const response = await client.linkTokenCreate({
      user: { client_user_id: userId },
      client_name: 'Fabriq',
      products: PLAID_PRODUCTS,
      country_codes: PLAID_COUNTRY_CODES,
      language: 'en',
      ...(process.env.PLAID_LINK_CUSTOMIZATION_NAME?.trim()
        ? { link_customization_name: process.env.PLAID_LINK_CUSTOMIZATION_NAME.trim() }
        : {}),
    });
    logger.info('Plaid link token created', { userId, orgId });
    return response.data.link_token;
  }

  async exchangePublicToken(
    publicToken: string,
    auth: AuthContext,
    metadata?: {
      institution?: { institution_id?: string; name?: string };
      legal_entity_id?: string;
    },
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
    const legalEntityId =
      (await this.resolveLegalEntityId(user.org_id, metadata?.legal_entity_id)) ?? null;

    const item = existing
      ? await prisma.plaid_item.update({
          where: { id: existing.id },
          data: {
            access_token: encryptAccessToken(accessToken),
            institution_id: institutionId,
            institution_name: institutionName,
            legal_entity_id: legalEntityId,
            modified_by: user.id,
          },
        })
      : await prisma.plaid_item.create({
          data: {
            org_id: user.org_id,
            user_id: user.id,
            institution_id: institutionId,
            institution_name: institutionName,
            legal_entity_id: legalEntityId,
            access_token: encryptAccessToken(accessToken),
            item_id: itemId,
            created_by: user.id,
            modified_by: user.id,
          },
        });

    return this.getItemSummary(item.id, user.org_id);
  }

  async listItems(orgId: string): Promise<PlaidItemSummary[]> {
    const items = await prisma.plaid_item.findMany({
      where: { org_id: orgId },
      orderBy: { created_at: 'desc' },
    });
    return Promise.all(items.map((item) => this.toItemSummary(item)));
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

  async importAccounts(
    itemDbId: string,
    plaidAccountIds: string[],
    auth: AuthContext,
  ): Promise<PlaidImportAccountsResult> {
    if (plaidAccountIds.length === 0) {
      throw new Error('Select at least one bank account to import');
    }

    const item = await prisma.plaid_item.findFirst({
      where: { id: itemDbId, org_id: auth.user.org_id },
    });
    if (!item) {
      throw new Error('Plaid connection not found');
    }

    this.assertConfigured();
    const accessToken = decryptAccessToken(item.access_token);
    const response = await getPlaidClient().accountsGet({ access_token: accessToken });
    const selected = response.data.accounts.filter((a) => plaidAccountIds.includes(a.account_id));
    if (selected.length === 0) {
      throw new Error('No matching Plaid accounts found for this connection');
    }

    const createdIds: string[] = [];
    const accounts: Array<{ plaid_account_id: string; fabriq_account_id: string }> = [];
    let skipped = 0;

    const { legalEntityId, baseCurrencyId } = await this.resolveEntityForImport(
      auth.user.org_id,
      item.legal_entity_id,
    );

    // Cache currency lookups across accounts in this batch
    const currencyCache = new Map<string, string | null>();

    for (const acct of selected) {
      const existing = await prisma.account.findFirst({
        where: { plaid_item_id: itemDbId, inst_id: acct.account_id },
        select: { id: true },
      });
      if (existing) {
        skipped++;
        continue;
      }

      if (!legalEntityId) {
        throw new Error('No legal entity found. Select an entity before importing bank accounts.');
      }

      // Prefer the Plaid account's own currency over the entity base currency
      const isoCode = acct.balances?.iso_currency_code ?? null;
      let accountCurrencyId = baseCurrencyId;
      if (isoCode) {
        if (!currencyCache.has(isoCode)) {
          const currencyRow = await prisma.currency.findFirst({
            where: { code: isoCode },
            select: { id: true },
          });
          currencyCache.set(isoCode, currencyRow?.id ?? null);
        }
        accountCurrencyId = currencyCache.get(isoCode) ?? baseCurrencyId;
      }

      const { classification, types } = mapPlaidAccountToCoa(acct.type, acct.subtype);
      const code = await this.generatePlaidAccountCode(
        auth.user.org_id,
        legalEntityId,
        classification,
      );

      const created = await prisma.account.create({
        data: {
          org_id: auth.user.org_id,
          name: formatPlaidAccountName(acct.name, acct.mask),
          code,
          classification,
          type: types,
          plaid_item_id: itemDbId,
          inst_id: acct.account_id,
          legal_entity_id: legalEntityId,
          base_currency_id: accountCurrencyId,
          parent_account_id: null,
          is_active: true,
          created_by: auth.user.id,
          modified_by: auth.user.id,
        },
      });
      createdIds.push(created.id);
      accounts.push({ plaid_account_id: acct.account_id, fabriq_account_id: created.id });
    }

    logger.info('Plaid accounts imported', {
      itemId: itemDbId,
      created: createdIds.length,
      skipped,
      legalEntityId,
      baseCurrencyId,
    });

    return { created: createdIds.length, skipped, account_ids: createdIds, accounts };
  }

  async linkPlaidAccount(
    itemDbId: string,
    plaidAccountId: string,
    fabriqAccountId: string,
    auth: AuthContext,
  ): Promise<PlaidLinkAccountResult> {
    const { item } = await this.validatePlaidLinkContext(
      itemDbId,
      plaidAccountId,
      auth.user.org_id,
    );

    const fabriqAccount = await prisma.account.findFirst({
      where: { id: fabriqAccountId, org_id: auth.user.org_id },
      select: { id: true, plaid_item_id: true, inst_id: true, legal_entity_id: true },
    });
    if (!fabriqAccount) {
      throw new Error('Fabriq account not found');
    }
    if (fabriqAccount.plaid_item_id && fabriqAccount.inst_id) {
      throw new Error('This Fabriq account is already linked to a Plaid account');
    }

    const updateData: {
      plaid_item_id: string;
      inst_id: string;
      legal_entity_id?: string;
      modified_by: string;
    } = {
      plaid_item_id: itemDbId,
      inst_id: plaidAccountId,
      modified_by: auth.user.id,
    };

    if (!fabriqAccount.legal_entity_id && item.legal_entity_id) {
      updateData.legal_entity_id = item.legal_entity_id;
    }

    await prisma.account.update({
      where: { id: fabriqAccount.id },
      data: updateData,
    });

    logger.info('Plaid account linked to existing Fabriq account', {
      itemId: itemDbId,
      plaidAccountId,
      fabriqAccountId,
    });

    return { plaid_account_id: plaidAccountId, fabriq_account_id: fabriqAccountId };
  }

  private async validatePlaidLinkContext(
    itemDbId: string,
    plaidAccountId: string,
    orgId: string,
  ): Promise<{
    item: { id: string; legal_entity_id: string | null; access_token: string };
    plaidAccount: AccountBase;
  }> {
    const item = await prisma.plaid_item.findFirst({
      where: { id: itemDbId, org_id: orgId },
      select: { id: true, legal_entity_id: true, access_token: true },
    });
    if (!item) {
      throw new Error('Plaid connection not found');
    }

    this.assertConfigured();
    const accessToken = decryptAccessToken(item.access_token);
    const response = await getPlaidClient().accountsGet({ access_token: accessToken });
    const plaidAccount = response.data.accounts.find((a) => a.account_id === plaidAccountId);
    if (!plaidAccount) {
      throw new Error('Plaid account not found on this connection');
    }

    const existingLink = await prisma.account.findFirst({
      where: { plaid_item_id: itemDbId, inst_id: plaidAccountId, org_id: orgId },
      select: { id: true },
    });
    if (existingLink) {
      throw new Error('This Plaid account is already linked');
    }

    return { item, plaidAccount };
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

    await prisma.account.updateMany({
      where: { plaid_item_id: itemDbId },
      data: { plaid_item_id: null, inst_id: null },
    });

    await prisma.plaid_item.delete({ where: { id: itemDbId } });
  }

  async syncItemAccount(
    itemDbId: string,
    plaidAccountId: string,
    auth: AuthContext,
  ): Promise<PlaidSyncResult> {
    const item = await prisma.plaid_item.findFirst({
      where: { id: itemDbId, org_id: auth.user.org_id },
      include: {
        accounts: {
          where: { inst_id: plaidAccountId },
          select: {
            id: true,
            inst_id: true,
            legal_entity_id: true,
            name: true,
            last_sync_at: true,
          },
        },
      },
    });
    if (!item) {
      throw new Error('Plaid connection not found');
    }
    if (item.accounts.length === 0) {
      throw new Error('This account is not imported. Import it before syncing.');
    }
    const account = item.accounts[0];
    if (!account.inst_id) {
      throw new Error('Plaid account id missing on linked account.');
    }

    const result = await this.syncSingleAccountTransactions(
      item,
      {
        id: account.id,
        inst_id: account.inst_id,
        legal_entity_id: account.legal_entity_id,
        last_sync_at: account.last_sync_at,
      },
      auth,
    );

    await prisma.account.update({
      where: { id: account.id },
      data: { last_sync_at: new Date() },
    });

    return result;
  }

  async syncItemById(itemDbId: string, auth: AuthContext): Promise<PlaidSyncResult> {
    const item = await prisma.plaid_item.findFirst({
      where: { id: itemDbId, org_id: auth.user.org_id },
      include: {
        accounts: {
          where: { inst_id: { not: null } },
          select: {
            id: true,
            inst_id: true,
            legal_entity_id: true,
            name: true,
          },
        },
      },
    });
    if (!item) {
      throw new Error('Plaid connection not found');
    }

    const readyAccounts = item.accounts.filter((a) => a.inst_id);
    if (readyAccounts.length === 0) {
      throw new Error('Link at least one bank account before syncing.');
    }

    const result = await this.syncItemRecord(
      { ...item, accounts: readyAccounts },
      auth,
      { updateCursor: true },
    );

    await prisma.account.updateMany({
      where: { id: { in: readyAccounts.map((a) => a.id) } },
      data: { last_sync_at: new Date() },
    });

    return result;
  }

  async syncItemByPlaidItemId(plaidItemId: string): Promise<PlaidSyncResult | null> {
    const item = await prisma.plaid_item.findFirst({
      where: { item_id: plaidItemId },
      include: {
        accounts: {
          where: { inst_id: { not: null } },
          select: {
            id: true,
            inst_id: true,
            legal_entity_id: true,
            name: true,
          },
        },
      },
    });
    if (!item) {
      return null;
    }
    if (item.accounts.length === 0) {
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
      accounts: {
        id: string;
        inst_id: string | null;
        legal_entity_id: string | null;
        name: string | null;
      }[];
    },
    _auth: AuthContext,
    options?: { plaidAccountIds?: Set<string>; updateCursor?: boolean },
  ): Promise<PlaidSyncResult> {
    this.assertConfigured();
    const accessToken = decryptAccessToken(item.access_token);
    const client = getPlaidClient();
    const updateCursor = options?.updateCursor ?? true;
    const singleAccountSync = Boolean(options?.plaidAccountIds?.size === 1);

    const accountMap = new Map<string, { fabriqAccountId: string; legalEntityId: string | null }>();
    for (const acct of item.accounts) {
      if (!acct.inst_id) continue;
      if (options?.plaidAccountIds && !options.plaidAccountIds.has(acct.inst_id)) continue;
      accountMap.set(acct.inst_id, { fabriqAccountId: acct.id, legalEntityId: acct.legal_entity_id });
    }

    if (accountMap.size === 0) {
      throw new Error('No linked accounts ready to sync.');
    }

    let cursor = item.cursor ?? undefined;
    let hasMore = true;
    let added = 0;
    let modified = 0;
    let removed = 0;
    let skipped = 0;
    const now = new Date();

    while (hasMore) {
      const response = await client.transactionsSync({ access_token: accessToken, cursor });
      const { added: addedTxns, modified: modifiedTxns, removed: removedTxns, next_cursor, has_more } = response.data;

      for (const tx of addedTxns as Transaction[]) {
        const target = accountMap.get(tx.account_id);
        if (!target) { if (!singleAccountSync) skipped++; continue; }

        const record = await prisma.plaid_transaction.upsert({
          where: { transaction_id: tx.transaction_id },
          create: {
            org_id: item.org_id,
            plaid_item_id: item.id,
            transaction_id: tx.transaction_id,
            plaid_account_id: tx.account_id,
            pending: tx.pending ?? false,
            pending_transaction_id: tx.pending_transaction_id ?? null,
            raw: tx as object,
            synced_at: now,
          },
          update: { raw: tx as object, pending: tx.pending ?? false, synced_at: now },
          select: { id: true, posting_id: true },
        });

        if (!record.posting_id) {
          const postingId = await this.createPlaidPosting(
            mapPlaidTransactionToPosting(tx, target.fabriqAccountId, item.org_id, target.legalEntityId),
            item.org_id,
          );
          await prisma.plaid_transaction.update({ where: { id: record.id }, data: { posting_id: postingId } });
          added++;
        } else {
          skipped++;
        }
      }

      for (const tx of modifiedTxns as Transaction[]) {
        const target = accountMap.get(tx.account_id);
        if (!target) { if (!singleAccountSync) skipped++; continue; }

        const postingData = mapPlaidTransactionToPosting(tx, target.fabriqAccountId, item.org_id, target.legalEntityId);

        const record = await prisma.plaid_transaction.upsert({
          where: { transaction_id: tx.transaction_id },
          create: {
            org_id: item.org_id,
            plaid_item_id: item.id,
            transaction_id: tx.transaction_id,
            plaid_account_id: tx.account_id,
            pending: tx.pending ?? false,
            pending_transaction_id: tx.pending_transaction_id ?? null,
            raw: tx as object,
            synced_at: now,
          },
          update: { raw: tx as object, pending: tx.pending ?? false, synced_at: now },
          select: { id: true, posting_id: true },
        });

        if (record.posting_id) {
          await prisma.posting.update({
            where: { id: record.posting_id },
            data: {
              amount: postingData.amount as number,
              description: (postingData.description as string | null) ?? null,
              status: postingData.status as string,
              posting_date: postingData.posting_date as Date,
              value_date: postingData.value_date as Date,
              ...(postingData.category_name != null ? { category_name: postingData.category_name as string } : {}),
              ...(postingData.ai_cat_score != null ? { ai_cat_score: postingData.ai_cat_score as number, ai_categorized_at: now } : {}),
            },
          });
          modified++;
        } else {
          const postingId = await this.createPlaidPosting(postingData, item.org_id);
          await prisma.plaid_transaction.update({ where: { id: record.id }, data: { posting_id: postingId } });
          added++;
        }
      }

      for (const removedTx of removedTxns) {
        const record = await prisma.plaid_transaction.findUnique({
          where: { transaction_id: removedTx.transaction_id },
          select: { id: true, posting_id: true },
        });
        if (record?.posting_id) {
          await prisma.posting.update({ where: { id: record.posting_id }, data: { status: 'VOIDED' } });
          await prisma.plaid_transaction.update({ where: { id: record.id }, data: { posting_id: null } });
        }
        removed++;
      }

      cursor = next_cursor;
      hasMore = has_more;
    }

    if (updateCursor) {
      await prisma.plaid_item.update({
        where: { id: item.id },
        data: { cursor: cursor ?? null, last_synced_at: now },
      });
    }

    logger.info('Plaid sync complete', { itemId: item.id, added, modified, removed, skipped, singleAccountSync, updateCursor });

    return { added, modified, removed, skipped };
  }

  /** Fetch and import transactions for one Plaid sub-account only (does not advance item cursor). */
  private async syncSingleAccountTransactions(
    item: { id: string; org_id: string; access_token: string },
    account: {
      id: string;
      inst_id: string;
      legal_entity_id: string | null;
      last_sync_at: Date | null;
    },
    _auth: AuthContext,
  ): Promise<PlaidSyncResult> {
    this.assertConfigured();
    const accessToken = decryptAccessToken(item.access_token);
    const client = getPlaidClient();

    const endDate = new Date();
    const startDate = new Date();
    if (account.last_sync_at) {
      startDate.setTime(account.last_sync_at.getTime() - 24 * 60 * 60 * 1000);
    } else {
      startDate.setDate(endDate.getDate() - 30);
    }

    const formatDate = (d: Date) => d.toISOString().slice(0, 10);
    let added = 0;
    let skipped = 0;
    let offset = 0;
    const pageSize = 500;
    let totalAvailable = 0;
    const now = new Date();

    while (true) {
      const response = await client.transactionsGet({
        access_token: accessToken,
        start_date: formatDate(startDate),
        end_date: formatDate(endDate),
        options: { account_ids: [account.inst_id], offset, count: pageSize },
      });

      totalAvailable = response.data.total_transactions;
      const transactions = response.data.transactions as Transaction[];

      for (const tx of transactions) {
        if (tx.account_id !== account.inst_id) continue;

        const record = await prisma.plaid_transaction.upsert({
          where: { transaction_id: tx.transaction_id },
          create: {
            org_id: item.org_id,
            plaid_item_id: item.id,
            transaction_id: tx.transaction_id,
            plaid_account_id: tx.account_id,
            pending: tx.pending ?? false,
            pending_transaction_id: tx.pending_transaction_id ?? null,
            raw: tx as object,
            synced_at: now,
          },
          update: { raw: tx as object, pending: tx.pending ?? false, synced_at: now },
          select: { id: true, posting_id: true },
        });

        if (!record.posting_id) {
          const postingId = await this.createPlaidPosting(
            mapPlaidTransactionToPosting(tx, account.id, item.org_id, account.legal_entity_id),
            item.org_id,
          );
          await prisma.plaid_transaction.update({ where: { id: record.id }, data: { posting_id: postingId } });
          added++;
        } else {
          skipped++;
        }
      }

      offset += transactions.length;
      if (offset >= totalAvailable || transactions.length === 0) break;
    }

    logger.info('Plaid single-account sync complete', {
      itemId: item.id,
      plaidAccountId: account.inst_id,
      fabriqAccountId: account.id,
      fetched: totalAvailable,
      added,
      skipped,
      startDate: formatDate(startDate),
      endDate: formatDate(endDate),
    });

    return { added, modified: 0, removed: 0, skipped };
  }

  /** Create a single bank-feed posting directly via Prisma and return its id. */
  private async createPlaidPosting(
    postingData: Record<string, unknown>,
    orgId: string,
  ): Promise<string> {
    const posting = await prisma.posting.create({
      data: {
        org_id: orgId,
        description: (postingData.description as string | null) ?? null,
        amount: postingData.amount as number,
        value_date: postingData.value_date as Date,
        posting_date: postingData.posting_date as Date,
        account_id: (postingData.account_id as string | null) ?? null,
        credit_account_id: (postingData.credit_account_id as string | null) ?? null,
        legal_entity_id: (postingData.legal_entity_id as string | null) ?? null,
        status: (postingData.status as string) ?? 'ACTIVE',
        posting_type: (postingData.posting_type as string) ?? 'bank_feed',
        reconciliation_status: (postingData.reconciliation_status as string) ?? 'UNMATCHED',
        ...(postingData.category_name != null ? { category_name: postingData.category_name as string } : {}),
        ...(postingData.ai_cat_score != null ? {
          ai_cat_score: postingData.ai_cat_score as number,
          ai_categorized_at: postingData.ai_categorized_at as Date,
        } : {}),
      },
      select: { id: true },
    });
    return posting.id;
  }

  private async loadPlaidAccounts(item: {
    id: string;
    access_token: string;
  }): Promise<StoredPlaidAccount[]> {
    this.assertConfigured();
    const accessToken = decryptAccessToken(item.access_token);
    const client = getPlaidClient();
    const response = await client.accountsGet({ access_token: accessToken });

    const mappings = await prisma.account.findMany({
      where: { plaid_item_id: item.id, inst_id: { not: null } },
      select: {
        id: true,
        inst_id: true,
        name: true,
        code: true,
        classification: true,
        created_at: true,
        last_sync_at: true,
      },
    });
    const fabriqByPlaidId = new Map(
      mappings
        .filter((m): m is typeof m & { inst_id: string } => m.inst_id !== null)
        .map((m) => [
          m.inst_id,
          {
            id: m.id,
            name: m.name,
            code: m.code,
            classification: m.classification,
            connectedAt: m.created_at,
            lastSyncAt: m.last_sync_at,
          },
        ]),
    );

    return response.data.accounts.map((acct) => {
      const mapped = fabriqByPlaidId.get(acct.account_id);
      const balance =
        acct.balances?.current ?? acct.balances?.available ?? acct.balances?.limit ?? null;
      return {
        plaid_account_id: acct.account_id,
        name: acct.name ?? null,
        mask: acct.mask ?? null,
        type: acct.type ?? null,
        subtype: acct.subtype ?? null,
        balance: balance != null ? Number(balance) : null,
        fabriq_account_id: mapped?.id ?? null,
        fabriq_account_name: mapped?.name ?? null,
        fabriq_account_code: mapped?.code ?? null,
        fabriq_classification: mapped?.classification ?? null,
        fabriq_connected_at: mapped?.connectedAt?.toISOString() ?? null,
        fabriq_last_sync_at: mapped?.lastSyncAt?.toISOString() ?? null,
      };
    });
  }

  private async toItemSummary(item: {
    id: string;
    item_id: string;
    institution_id: string | null;
    institution_name: string | null;
    legal_entity_id: string | null;
    last_synced_at: Date | null;
    created_at: Date;
    access_token: string;
  }): Promise<PlaidItemSummary> {
    let accounts: StoredPlaidAccount[] = [];
    try {
      accounts = await this.loadPlaidAccounts(item);
    } catch (err) {
      logger.warn('Failed to load Plaid accounts for item summary', { itemId: item.id, err });
    }

    return {
      id: item.id,
      item_id: item.item_id,
      institution_id: item.institution_id,
      institution_name: item.institution_name,
      legal_entity_id: item.legal_entity_id,
      last_synced_at: item.last_synced_at?.toISOString() ?? null,
      created_at: item.created_at.toISOString(),
      accounts,
    };
  }
}
