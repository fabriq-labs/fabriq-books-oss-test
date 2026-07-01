import * as fs from 'fs';
import * as path from 'path';
import bcrypt from 'bcrypt';
import prisma from '../../lib/prisma';
import {
  buildPostingImportFieldMapping,
  normalizeFabriqApiBaseUrl,
} from '../../lib/import/bankStatementImportClient';
import {
  stableIndianDemoApiKeyPlaintext,
  stableUsCaDemoApiKeyPlaintext,
} from '../test-utils/demoStableApiKeys';

const DANIEL_EMAIL = 'daniel.lee@techflowsolutions.com';
const DANIEL_EXPECTED_ORG = 'org_techflow_us';

function isDatabaseUnavailable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("Can't reach database") ||
    msg.includes('P1001') ||
    msg.includes('PrismaClientInitializationError') ||
    msg.includes('ECONNREFUSED')
  );
}

describe('bankStatementImportClient', () => {
  it('normalizeFabriqApiBaseUrl strips trailing slash', () => {
    expect(normalizeFabriqApiBaseUrl('http://localhost:4000/')).toBe('http://localhost:4000');
  });

  it('normalizeFabriqApiBaseUrl strips trailing /api', () => {
    expect(normalizeFabriqApiBaseUrl('http://localhost:4000/api')).toBe('http://localhost:4000');
    expect(normalizeFabriqApiBaseUrl('http://localhost:4000/api/')).toBe('http://localhost:4000');
  });

  it('normalizeFabriqApiBaseUrl leaves already-normal base unchanged', () => {
    expect(normalizeFabriqApiBaseUrl('http://localhost:4000')).toBe('http://localhost:4000');
  });

  it('buildPostingImportFieldMapping unions keys across rows (debit vs credit columns)', () => {
    const mapping = buildPostingImportFieldMapping([
      { value_date: '2026-01-15', amount: 100, credit_account_id: 'bank1', description: 'a' },
      { value_date: '2026-01-16', amount: 200, account_id: 'bank1', description: 'b' },
    ]);
    expect(mapping.account_id).toBe('account_id');
    expect(mapping.credit_account_id).toBe('credit_account_id');
    expect(Object.keys(mapping).sort()).toEqual(
      ['account_id', 'amount', 'credit_account_id', 'description', 'value_date'].sort()
    );
  });
});

describe('US/CA demo: Daniel Lee API key hash', () => {
  jest.setTimeout(15000);

  it('matches stableUsCaDemoApiKeyPlaintext when user is seeded', async () => {
    let user: { id: string; email: string | null; org_id: string | null; api_key: string | null } | null;
    try {
      user = await prisma.user.findUnique({
        where: { email: DANIEL_EMAIL },
        select: { id: true, email: true, org_id: true, api_key: true },
      });
    } catch (e) {
      if (isDatabaseUnavailable(e)) {
        console.log('Skipping: database unreachable (check DATABASE_URL / network).');
        return;
      }
      throw e;
    }

    if (!user?.api_key || !user.org_id) {
      console.log(
        `Skipping: ${DANIEL_EMAIL} not found or missing api_key/org_id (load US_CA demo seed).`
      );
      return;
    }

    expect(user.org_id).toBe(DANIEL_EXPECTED_ORG);

    const plaintext = stableUsCaDemoApiKeyPlaintext(user.id);
    const ok = await bcrypt.compare(plaintext, user.api_key);
    expect(ok).toBe(true);
  });

  it('optional: any seeded user with api_key matches Indian or US/CA stable pattern', async () => {
    let user: { id: string; api_key: string | null } | null;
    try {
      user = await prisma.user.findFirst({
        where: { api_key: { not: null }, org_id: { not: null } },
        select: { id: true, api_key: true },
      });
    } catch (e) {
      if (isDatabaseUnavailable(e)) {
        console.log('Skipping: database unreachable (check DATABASE_URL / network).');
        return;
      }
      throw e;
    }

    if (!user?.api_key) {
      console.log('Skipping: no user with api_key + org_id in database.');
      return;
    }

    const indian = stableIndianDemoApiKeyPlaintext(user.id);
    const usCa = stableUsCaDemoApiKeyPlaintext(user.id);
    const matchesIndian = await bcrypt.compare(indian, user.api_key);
    const matchesUsCa = await bcrypt.compare(usCa, user.api_key);
    expect(matchesIndian || matchesUsCa).toBe(true);
  });

  it('US/CA sample CSV fixture exists', () => {
    const csvPath = path.join(
      __dirname,
      '../../../test-data/us-ca-bank-import/sample-bank-statement.csv'
    );
    expect(fs.existsSync(csvPath)).toBe(true);
  });

  const usCaPdfPath = path.join(
    __dirname,
    '../../../test-data/us-ca-bank-import/pdf-categorization-only/sample-bank-statement-categorization.pdf'
  );
  const hasUsCaPdfFixture = fs.existsSync(usCaPdfPath);

  (hasUsCaPdfFixture ? it : it.skip)(
    'US/CA sample PDF for categorization import exists',
    () => {
      expect(fs.statSync(usCaPdfPath).size).toBeGreaterThan(500);
    }
  );
});

describe('optional HTTP smoke (FABRIQ_IMPORT_HTTP_TEST=1)', () => {
  jest.setTimeout(15000);

  const runHttp = process.env.FABRIQ_IMPORT_HTTP_TEST === '1';
  const base =
    process.env.FABRIQ_API_BASE_URL?.replace(/\/$/, '') || 'http://localhost:4000';

  it('GET /api/health and /api/metadata/user/me with Daniel stable API key', async () => {
    if (!runHttp) {
      console.log('Skipping HTTP test (set FABRIQ_IMPORT_HTTP_TEST=1 and run backend).');
      return;
    }

    let user: { id: string; api_key: string | null; org_id: string | null } | null;
    try {
      user = await prisma.user.findUnique({
        where: { email: DANIEL_EMAIL },
        select: { id: true, api_key: true, org_id: true },
      });
    } catch (e) {
      if (isDatabaseUnavailable(e)) {
        console.log('Skipping HTTP: database unreachable.');
        return;
      }
      throw e;
    }

    if (!user?.api_key || !user.org_id) {
      console.log(`Skipping HTTP: ${DANIEL_EMAIL} not seeded.`);
      return;
    }

    const key = stableUsCaDemoApiKeyPlaintext(user.id);
    let health: Response;
    try {
      health = await fetch(`${base}/api/health`);
    } catch (e) {
      console.log(`Skipping HTTP: fetch failed (${e instanceof Error ? e.message : e}).`);
      return;
    }
    if (!health.ok) {
      console.log(`Skipping HTTP: /api/health returned ${health.status} (server up?)`);
      return;
    }

    const me = await fetch(`${base}/api/metadata/user/me`, {
      headers: { 'X-API-Key': key },
    });

    expect(me.ok).toBe(true);
    const body = (await me.json()) as { id?: string; org_id?: string };
    expect(body.id).toBe(user.id);
    expect(body.org_id).toBe(user.org_id);
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
