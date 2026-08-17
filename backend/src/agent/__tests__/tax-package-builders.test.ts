import '../builders';

import { ActionBuilderRegistry } from '../builders/ActionBuilderRegistry';
import { ReportFormatterRegistry } from '../builders/ReportFormatterRegistry';
import { formatTaxPackageCoverLetter } from '../builders/TaxPackageReportFormatter';
import { buildPinnedPlan, TAX_PACKAGE_KIND, TAX_PACKAGE_TEMPLATE_ID } from '../taxPackage/constants';
import { PlanStep } from '../tools/sessionTools';

const auth = { user: { id: 'user_1', email: 't@t.com', name: 'T', org_id: 'org_rajesh' } } as any;
const session = {
  id: 'ses_t1',
  goal: 'Prepare Canadian T1 package for TY 2025 for Meera Patel CPA.',
  goal_model: 'posting',
  mode: 'supervised',
  template_id: TAX_PACKAGE_TEMPLATE_ID,
};

function step(overrides: Partial<PlanStep>): PlanStep {
  return {
    index: 0,
    type: 'action',
    title: 'Categorise unmatched lines',
    description: 'Queue categorize_transaction',
    status: 'in_progress',
    requires_approval: true,
    ...overrides,
  };
}

const unmatched = [
  {
    posting_id: 'post_hd',
    description: 'Home Depot Milton — basement suite paint',
    amount: 214.67,
    value_date: '2025-04-12',
    entity: 'canada' as const,
    currency: 'CAD' as const,
    current_account_id: 'acco_5990',
    current_account_name: 'Miscellaneous — Canada',
    predicted_account_id: 'acco_5220',
    predicted_account_name: 'Basement rental expenses (T776)',
    confidence: 'medium' as const,
    reason: 'Looks like a T776 repair',
  },
];

describe('Tax package builders', () => {
  test('books-ready builder queues categorize_transaction and does not match send step', async () => {
    const scanCtx = {
      tax_package_kind: TAX_PACKAGE_KIND,
      unmatched_postings: unmatched,
      unmatched_count: 1,
    };
    const books = ActionBuilderRegistry.get('posting', step({ title: 'Categorise unmatched lines' }), scanCtx);
    expect(books).not.toBeNull();
    const built = await books!.build(scanCtx, session, auth);
    expect(built.actionType).toBe('categorize_transaction');
    expect(built.pendingActions).toHaveLength(1);
    expect(built.pendingActions[0].payload.predicted_account_name).toMatch(/Basement rental/);

    const sendTooEarly = ActionBuilderRegistry.get(
      'posting',
      step({ title: 'Approve package for CPA' }),
      scanCtx
    );
    expect(sendTooEarly).toBeNull();
  });

  test('send builder queues approve_tax_package when workpapers exist', async () => {
    const ctx = {
      tax_package_kind: TAX_PACKAGE_KIND,
      tax_year: 2025,
      recipient: 'Meera Patel CPA',
      workpapers: { canada: {}, foreign: null, exclusions: [] },
      unmatched_count: 0,
    };
    const builder = ActionBuilderRegistry.get(
      'posting',
      step({ title: 'Approve package for CPA' }),
      ctx
    );
    expect(builder).not.toBeNull();
    const built = await builder!.build(ctx, session, auth);
    expect(built.actionType).toBe('approve_tax_package');
    expect(built.pendingActions).toHaveLength(1);
    expect(built.pendingActions[0].title).toMatch(/Meera Patel CPA/);
  });

  test('cover letter includes NRE taxable-in-Canada warning', () => {
    const letter = formatTaxPackageCoverLetter({
      tax_year: 2025,
      recipient: 'Meera Patel CPA',
      unmatched_count: 0,
      warnings: ['NRE interest is taxable on the Canadian T1 even though it is exempt on the NRI ITR.'],
      workpapers: {
        canada: {
          t4_net_salary: [],
          t4_bonus: [],
          t776_rent: [],
          t776_expenses: [],
          t2125_studio: [],
          hst_remitted: [],
          interest_td: [],
          rrsp: [],
          tfsa: [],
          cra_instalments: [],
        },
        foreign: {
          rent_gross: [],
          rent_expenses: [],
          nro_interest: [],
          nre_interest: [{
            label: 'NRE interest — EXEMPT in India, TAXABLE in Canada',
            entity: 'india',
            currency: 'INR',
            amount_orig: 12000,
            amount_cad: 192,
          }],
          dividends: [],
          capital_gains: [],
          tax_paid_cy: [],
        },
        exclusions: [{
          label: 'Wise CAD→INR remittance (equity, not income)',
          entity: 'canada',
          currency: 'CAD',
          amount_orig: 800,
          amount_cad: 800,
        }],
        t1135_note: 'over CAD 100k',
        fx_method: 'Monthly AVERAGE INR→CAD',
      },
      gaps: [],
    });
    expect(letter).toMatch(/Meera Patel CPA/);
    expect(letter).toMatch(/NRE interest is taxable on the Canadian T1/);
    expect(letter).toMatch(/Wise CAD→INR remittance/);
    expect(letter).not.toMatch(/Suresh/);
  });

  test('report formatter matches tax-package report step', () => {
    const formatter = ReportFormatterRegistry.get(
      'posting',
      step({ type: 'report', title: 'Cover letter and index' }),
      { ...session, accumulated_context: { tax_package_kind: TAX_PACKAGE_KIND } }
    );
    expect(formatter).not.toBeNull();
  });

  test('pinned plan is 6 supervised steps', () => {
    const plan = buildPinnedPlan();
    expect(plan).toHaveLength(6);
    expect(plan.map((s) => s.type)).toEqual(['query', 'query', 'action', 'analysis', 'action', 'report']);
    expect(plan[0].status).toBe('in_progress');
    expect(plan[2].requires_approval).toBe(true);
    expect(plan[4].requires_approval).toBe(true);
  });
});
