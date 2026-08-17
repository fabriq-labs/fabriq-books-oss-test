import { parseTaxPackageGoal, calendarBounds } from '../taxPackage/parseGoal';

describe('parseTaxPackageGoal', () => {
  test('extracts year, CPA recipient, basement %, and worldwide foreign', () => {
    const parsed = parseTaxPackageGoal(
      'Prepare Canadian T1 package for TY 2025 for Meera Patel CPA. Basement rentable share 25%. Include India foreign income.'
    );
    expect(parsed.tax_year).toBe(2025);
    expect(parsed.recipient).toBe('Meera Patel CPA');
    expect(parsed.basement_rentable_pct).toBe(25);
    expect(parsed.include_foreign).toBe(true);
  });

  test('canada-only turns off foreign', () => {
    const parsed = parseTaxPackageGoal('Prepare T1 for 2024. Canada-only.');
    expect(parsed.tax_year).toBe(2024);
    expect(parsed.include_foreign).toBe(false);
    expect(parsed.recipient).toBe('Meera Patel CPA');
  });

  test('defaults when goal is empty', () => {
    const parsed = parseTaxPackageGoal('', { tax_year: 2025 });
    expect(parsed.tax_year).toBe(2025);
    expect(parsed.recipient).toBe('Meera Patel CPA');
    expect(parsed.include_foreign).toBe(true);
    expect(parsed.basement_rentable_pct).toBeNull();
  });

  test('calendarBounds is Jan 1 – Dec 31', () => {
    expect(calendarBounds(2025)).toEqual({ from_date: '2025-01-01', to_date: '2025-12-31' });
  });
});
