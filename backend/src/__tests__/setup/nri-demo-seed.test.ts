/**
 * Smoke checks for NRI demo seed assets (no database required).
 */
import fs from 'fs';
import path from 'path';
import { ORG_ID, ENT_CA, ENT_IN, RAJESH_EMAIL } from '../../utils/setup/setupNriDemo';

describe('NRI demo seed assets', () => {
  const nriDir = path.join(__dirname, '..', '..', '..', 'prisma', 'setup-NRI');

  it('exports stable org/entity identifiers', () => {
    expect(ORG_ID).toBe('org_rajesh');
    expect(ENT_CA).toBe('ent_rajesh_canada');
    expect(ENT_IN).toBe('ent_rajesh_india');
    expect(RAJESH_EMAIL).toBe('rajesh.menon@gmail.com');
  });

  it('loads Canada and India chart-of-accounts templates', () => {
    for (const file of ['chart-of-accounts-canada.json', 'chart-of-accounts-india.json']) {
      const raw = fs.readFileSync(path.join(nriDir, file), 'utf8');
      const parsed = JSON.parse(raw);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBeGreaterThanOrEqual(5);
      expect(parsed[0]).toMatchObject({
        name: expect.any(String),
        classification: expect.any(String),
        types: expect.any(Array),
      });
    }
  });
});
