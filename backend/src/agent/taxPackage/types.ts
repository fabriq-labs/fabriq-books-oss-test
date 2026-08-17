export type TaxPackagePhase = 'scan' | 'assemble';

export type MoneyLine = {
  label: string;
  account_code?: string;
  entity: 'canada' | 'india';
  currency: 'CAD' | 'INR';
  amount_orig: number;
  amount_cad: number;
  notes?: string;
};

export type GapItem = {
  id: string;
  status: 'required' | 'optional' | 'missing' | 'waived' | 'in_ledger';
  severity: 'required' | 'optional';
  title: string;
  detail: string;
};

export type UnmatchedLine = {
  posting_id: string;
  description: string;
  amount: number;
  value_date: string;
  entity: 'canada' | 'india';
  currency: 'CAD' | 'INR';
  current_account_id: string | null;
  current_account_name: string | null;
  predicted_account_id: string | null;
  predicted_account_name: string | null;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
};

export type TaxPackageIntake = {
  tax_year: number;
  recipient: string;
  include_foreign: boolean;
  basement_rentable_pct: number | null;
};

export type TaxPackageWorkpapers = {
  canada: {
    t4_net_salary: MoneyLine[];
    t4_bonus: MoneyLine[];
    t776_rent: MoneyLine[];
    t776_expenses: MoneyLine[];
    t2125_studio: MoneyLine[];
    hst_remitted: MoneyLine[];
    interest_td: MoneyLine[];
    rrsp: MoneyLine[];
    tfsa: MoneyLine[];
    cra_instalments: MoneyLine[];
  };
  foreign: {
    rent_gross: MoneyLine[];
    rent_expenses: MoneyLine[];
    nro_interest: MoneyLine[];
    nre_interest: MoneyLine[];
    dividends: MoneyLine[];
    capital_gains: MoneyLine[];
    tax_paid_cy: MoneyLine[];
  } | null;
  exclusions: MoneyLine[];
  t1135_note: string;
  fx_method: string;
};

export type TaxPackageResult = TaxPackageIntake & {
  tax_package_kind: 'ca_t1';
  phase: TaxPackagePhase;
  canada_entity_id: string | null;
  india_entity_id: string | null;
  from_date: string;
  to_date: string;
  unmatched_postings: UnmatchedLine[];
  unmatched_count: number;
  workpapers: TaxPackageWorkpapers | null;
  gaps: GapItem[];
  warnings: string[];
};
