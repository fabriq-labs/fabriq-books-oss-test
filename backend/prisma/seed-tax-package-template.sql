-- Canadian T1 tax-package Workbench skill (system-wide).
-- Requires agent_template.pinned_plan / intake_schema (see migration/add_agent_template_pinned_plan.sql).

INSERT INTO agent_template (
  id, org_id, name, description, icon, goal_model, system_prompt, user_hint,
  default_mode, is_active, sort_order, focus_models, allowed_tools,
  pinned_plan, intake_schema, created_at
) VALUES (
  'atpl_tax_package_ca_t1',
  NULL,
  'Prepare tax package',
  'Assemble a Canadian T1 organizer for the CPA: books-ready gate, T776/T2125, India foreign income, then export.',
  'file-spreadsheet',
  'posting',
  $tp$You are assembling a Canadian T1 organizer for a tax resident with possible India foreign income. You are not the CPA. You do not file, compute federal/Ontario tax, or apply the Canada–India DTAA.

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
$tp$,
  'Tax year and CPA, e.g. "TY 2025 for Meera Patel CPA, basement 25%"',
  'supervised',
  true,
  0,
  ARRAY['posting', 'account', 'entity', 'exchange_rate'],
  ARRAY['prepareTaxPackage', 'requestClarification', 'queueActions', 'searchRecords', 'runFinancialReport', 'getAnalyticsContext', 'analyticsQuery'],
  $plan$[
    {"type":"query","title":"Lock tax year and recipient","description":"Confirm calendar tax year, CPA recipient, and whether India books are in scope.","requires_approval":false},
    {"type":"query","title":"Scan books for unmatched lines","description":"Call prepareTaxPackage with phase=scan.","requires_approval":false},
    {"type":"action","title":"Categorise unmatched lines","description":"Queue categorize_transaction for unmatched lines.","requires_approval":true},
    {"type":"analysis","title":"Assemble T1 workpapers","description":"Call prepareTaxPackage with phase=assemble.","requires_approval":false},
    {"type":"action","title":"Approve package for CPA","description":"Queue approve_tax_package.","requires_approval":true},
    {"type":"report","title":"Cover letter and index","description":"Write the cover letter.","requires_approval":false}
  ]$plan$::jsonb,
  $intake${
    "lock_mode":"supervised",
    "fields":[
      {"key":"tax_year","type":"single_select","label":"Canadian tax year","default":"2025","options":[{"id":"2025","label":"2025 (calendar)"},{"id":"2024","label":"2024 (calendar)"}]},
      {"key":"recipient","type":"text","label":"Send package to","default":"Meera Patel CPA"},
      {"key":"basement_pct","type":"number","label":"Milton basement rentable %","optional":true},
      {"key":"include_foreign","type":"single_select","label":"India foreign income","default":"yes","options":[{"id":"yes","label":"Include (worldwide T1)"},{"id":"no","label":"Canada-source only"}]}
    ]
  }$intake$::jsonb,
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  goal_model = EXCLUDED.goal_model,
  system_prompt = EXCLUDED.system_prompt,
  user_hint = EXCLUDED.user_hint,
  default_mode = EXCLUDED.default_mode,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active,
  focus_models = EXCLUDED.focus_models,
  allowed_tools = EXCLUDED.allowed_tools,
  pinned_plan = EXCLUDED.pinned_plan,
  intake_schema = EXCLUDED.intake_schema;
