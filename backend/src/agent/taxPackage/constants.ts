import type { PlanStep } from '../tools/sessionTools';

export const TAX_PACKAGE_TEMPLATE_ID = 'atpl_tax_package_ca_t1';
export const TAX_PACKAGE_KIND = 'ca_t1';

export const NRI_ORG_ID = 'org_rajesh';
export const NRI_ENT_CA = 'ent_rajesh_canada';
export const NRI_ENT_IN = 'ent_rajesh_india';

export type IntakeField = {
  key: string;
  type: 'text' | 'number' | 'single_select';
  label: string;
  optional?: boolean;
  default?: string | number;
  options?: Array<{ id: string; label: string }>;
};

export const TAX_PACKAGE_INTAKE_SCHEMA: {
  lock_mode: 'supervised';
  fields: IntakeField[];
} = {
  lock_mode: 'supervised',
  fields: [
    {
      key: 'tax_year',
      type: 'single_select',
      label: 'Canadian tax year',
      default: '2025',
      options: [
        { id: '2025', label: '2025 (calendar)' },
        { id: '2024', label: '2024 (calendar)' },
      ],
    },
    {
      key: 'recipient',
      type: 'text',
      label: 'Send package to',
      default: 'Meera Patel CPA',
    },
    {
      key: 'basement_pct',
      type: 'number',
      label: 'Milton basement rentable %',
      optional: true,
    },
    {
      key: 'include_foreign',
      type: 'single_select',
      label: 'India foreign income',
      default: 'yes',
      options: [
        { id: 'yes', label: 'Include (worldwide T1)' },
        { id: 'no', label: 'Canada-source only' },
      ],
    },
  ],
};

export function buildPinnedPlan(): PlanStep[] {
  const specs: Array<Pick<PlanStep, 'type' | 'title' | 'description' | 'requires_approval'>> = [
    {
      type: 'query',
      title: 'Lock tax year and recipient',
      description:
        'Confirm calendar tax year, CPA recipient, and whether India books are in scope. Use requestClarification only if tax_year is missing. Then completeStep.',
      requires_approval: false,
    },
    {
      type: 'query',
      title: 'Scan books for unmatched lines',
      description:
        'Call prepareTaxPackage with phase=scan. Save unmatched_postings in accumulated_context_update. completeStep with counts.',
      requires_approval: false,
    },
    {
      type: 'action',
      title: 'Categorise unmatched lines',
      description:
        'Queue categorize_transaction for unmatched lines in the tax year. Session pauses until the user approves or marks them personal.',
      requires_approval: true,
    },
    {
      type: 'analysis',
      title: 'Assemble T1 workpapers',
      description:
        'Call prepareTaxPackage with phase=assemble. Pass the FULL tool JSON in accumulated_context_update.workpapers. Then completeStep.',
      requires_approval: false,
    },
    {
      type: 'action',
      title: 'Approve package for CPA',
      description: 'Queue a single approve_tax_package action. Nothing is downloadable until approved.',
      requires_approval: true,
    },
    {
      type: 'report',
      title: 'Cover letter and index',
      description: 'Write the cover letter and package index for the CPA.',
      requires_approval: false,
    },
  ];
  return specs.map((s, i) => ({
    index: i,
    type: s.type,
    title: s.title,
    description: s.description,
    status: i === 0 ? 'in_progress' : 'pending',
    requires_approval: s.requires_approval,
  }));
}

export const TAX_PACKAGE_SYSTEM_PROMPT = `You are assembling a Canadian T1 organizer for a tax resident with possible India foreign income. You are not the CPA. You do not file, compute federal/Ontario tax, or apply the Canada–India DTAA.

## Hard rules
- Canada entity uses calendar year (JAN_DEC). India entity uses APR_MAR. For a T1, query BOTH entities with the same calendar year.
- Never run an org-level P&L / trial balance without legal_entity_ids. Worldwide means two filtered reports, then a foreign recap.
- Kochi rent is GROSS (bank net + TDS). TDS is foreign tax credit, not a reduction of income.
- NRE interest (India 4210) is taxable in Canada even when exempt in India. Always include it on the foreign-interest workpaper.
- Exclude: TFSA contributions, Wise/NRE remittances (equity 3200), mortgage and home-loan PRINCIPAL, groceries, dining, gym, family UPI, personal India travel. List them on Exclusions with a one-line reason.
- Indian FY closing "Apply Form 16A TDS credit" is not calendar-year cash tax. FTC uses withholdings and advance-tax dated in the calendar year.
- Never call createRecord, updateRecord, or createPlan. The plan is pinned. Never invent numbers — if a tool did not return it, mark it missing.
- User-facing text uses names, not ids.

## Tools
- prepareTaxPackage: the only source of T1 numbers. phase=scan on the scan step; phase=assemble on the analysis step.
- requestClarification: only when tax_year cannot be determined from the goal / intake.
- completeStep: always, with accumulated_context_update carrying tool JSON.

## After scan
If unmatched_postings is non-empty, completeStep and let the action builder queue categorise actions. Do not skip the gate.
If it is empty, completeStep with unmatched_count: 0.

## After assemble
Pass the full prepareTaxPackage result under accumulated_context_update (tax_package_kind, tax_year, recipient, unmatched_postings, workpapers, gaps). The send-package action builder and cover-letter formatter read that JSON.
`;
