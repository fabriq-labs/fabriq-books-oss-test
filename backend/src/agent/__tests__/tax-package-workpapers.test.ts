/**
 * TY 2025 assemble against org_rajesh NRI seed.
 * Skips when the NRI demo org is not present.
 */
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../../.env.test') });
dotenv.config();

import prisma from '../../lib/prisma';
import { assembleTaxPackage, scanTaxPackage } from '../taxPackage/workpapers';
import { NRI_ORG_ID } from '../taxPackage/constants';

describe('tax package workpapers (NRI seed)', () => {
  let orgExists = false;

  beforeAll(async () => {
    const org = await prisma.org.findUnique({ where: { id: NRI_ORG_ID }, select: { id: true } });
    orgExists = Boolean(org);
    if (!orgExists) {
      console.warn(`Skipping NRI tax-package workpaper tests — ${NRI_ORG_ID} not seeded`);
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const intake = {
    tax_year: 2025,
    recipient: 'Meera Patel CPA',
    include_foreign: true,
    basement_rentable_pct: null as number | null,
  };

  test('scan finds unmatched 2025 gate lines including Home Depot', async () => {
    if (!orgExists) return;
    const scan = await scanTaxPackage(NRI_ORG_ID, intake);
    expect(scan.phase).toBe('scan');
    expect(scan.workpapers).toBeNull();
    expect(scan.unmatched_count).toBeGreaterThanOrEqual(3);
    const descs = scan.unmatched_postings.map((u) => u.description);
    expect(descs.some((d) => /Home Depot/i.test(d))).toBe(true);
    expect(descs.some((d) => /Interac/i.test(d))).toBe(true);
    const hd = scan.unmatched_postings.find((u) => /Home Depot/i.test(u.description));
    expect(hd?.predicted_account_name).toMatch(/Basement rental expenses/);
  });

  test('assemble includes NRE interest, excludes remittances, recuts India to calendar year', async () => {
    if (!orgExists) return;
    const result = await assembleTaxPackage(NRI_ORG_ID, intake);
    expect(result.from_date).toBe('2025-01-01');
    expect(result.to_date).toBe('2025-12-31');
    expect(result.workpapers).toBeTruthy();
    const nre = result.workpapers!.foreign?.nre_interest || [];
    expect(nre.length).toBeGreaterThan(0);
    expect(nre[0].amount_orig).toBeGreaterThan(0);
    expect(result.warnings.some((w) => /NRE interest is taxable/i.test(w))).toBe(true);

    const exclusions = result.workpapers!.exclusions.map((l) => l.label).join(' ');
    expect(exclusions).toMatch(/remittance/i);
    expect(exclusions).toMatch(/TFSA/i);

    const rent = result.workpapers!.foreign?.rent_gross || [];
    expect(rent.length).toBeGreaterThan(0);
    // Calendar 2025 includes Jan–Mar (FY 2024-25) AND Apr–Dec (FY 2025-26), so 12 months not 12-of-one-FY only.
    expect(result.from_date).not.toBe('2025-04-01');
    expect(result.to_date).not.toBe('2026-03-31');

    const tds = result.workpapers!.foreign?.tax_paid_cy || [];
    expect(tds.length).toBeGreaterThan(0);
  });

  test('canada-only omits foreign workpapers', async () => {
    if (!orgExists) return;
    const result = await assembleTaxPackage(NRI_ORG_ID, { ...intake, include_foreign: false });
    expect(result.workpapers?.foreign).toBeNull();
  });
});
