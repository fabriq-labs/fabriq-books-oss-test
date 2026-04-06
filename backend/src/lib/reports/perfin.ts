import prisma from '../prisma';
import { Prisma } from '@prisma/client';

interface IncomeStatementRow {
  account_path: string;
  account_name: string;
  classification: "Income" | "Expense";
  level: number;
  total_amount: number;
}

interface TrialBalanceRow {
  account_id: string;
  classification: string;
  account_path: string;
  account_name: string;
  account_type: string;
  level: number;
  parent_account_id: string;
  account_currency: string | null;
  report_currency: string;
  period_rate: number;
  opening_rate: number;
  total_debits: number;
  total_credits: number;
  balance: number;
  opening_balance: number;
  total_balance: number;
  total_debits_orig: number;
  total_credits_orig: number;
  balance_orig: number;
}

interface IncomeSplitItem {
  name: string;
  value: number;
  percentage: number;
}

interface AssetAccountBreakdown {
  category: string;
  account_name: string;
  balance: number;
  percentage: number;
}

interface LiabilityMetrics {
  total_debt: number;
  monthly_payments: number;
  debt_to_income_ratio: number;
}

interface LiabilityItem {
  name: string;
  amount: number;
}
interface LiabilityBreakdown {
  type: string;
  total_amount: number;
  percentage: number;
  items: LiabilityItem[];
}
interface IncomeDetailItem {
  name: string;
  value: number;
  percentage: number;
}

interface ClassificationBreakdownItem {
  name: string;
  value: number;
  percentage: number;
}
export const getIncomeStatement = async (
  startDate: string,
  endDate: string,
  orgId: string,
  accountId?: string // accountId may be undefined
): Promise<IncomeStatementRow[]> => {
  const incomeStatement = await prisma.$queryRaw<IncomeStatementRow[]>`
        WITH 
  account_balances AS (
    SELECT 
      ah.id,ah."path", ah."name", ah.classification, ah."level", ah.parent_account_id,
      COALESCE(SUM(CASE 
        WHEN p.account_id = ah.id THEN p.amount 
        WHEN p.credit_account_id = ah.id THEN -p.amount
        ELSE 0 
      END), 0) as balance
    FROM account_hierarchy ah
    LEFT JOIN posting p ON 
      (p.account_id = ah.id OR p.credit_account_id = ah.id)
      AND p.value_date BETWEEN ${startDate}::date AND ${endDate}::date
    WHERE ah.org_id = ${orgId} ${accountId ? Prisma.sql`AND ah.id = ${accountId}` : Prisma.empty}
    GROUP BY ah.id, ah.path, ah.name, ah.classification, ah.level, ah.parent_account_id
  ),
  
  parent_totals AS (
    SELECT 
      ah.id,
      SUM(ab.balance) as rolled_up_balance
    FROM account_hierarchy ah
    LEFT JOIN account_balances ab ON ab.parent_account_id = ah.id
    AND ah.org_id = ${orgId} AND ab.org_id = ${orgId}
    GROUP BY ah.id
  )
  
  SELECT 
    ab.path as account_path,
    ab.name as account_name,
    ab.classification,
    ab.level,
    COALESCE(ab.balance, 0) + COALESCE(pt.rolled_up_balance, 0) as total_amount
  FROM account_balances ab
  LEFT JOIN parent_totals pt ON ab.id = pt.id
  ORDER BY ab.path;`;
  return incomeStatement;
};

export const getTrialBalance = async (
  startDate: string,
  endDate: string,
  orgId: string,
  accountId?: string,
  reportCurrency?: string, // ISO code override; if omitted, uses org base_currency
  legalEntityIds?: string[] // when provided, only include accounts whose legal_entity_id is in this list (excludes NULL)
): Promise<TrialBalanceRow[]> => {

  // Calculate previous year date range for opening balance
  const currentYear = new Date(startDate).getFullYear();
  const prevYearStart = `${currentYear - 1}-04-01`;
  const prevYearEnd = `${currentYear}-03-31`;

  // NULL means "use org default"; a value means "use this currency"
  const currencyParam = reportCurrency || null;

  const trialBalance = await prisma.$queryRaw<TrialBalanceRow[]>`
      WITH
      -- Resolve reporting currency: explicit param > org base_currency > 'INR'
      org_base AS (
        SELECT COALESCE(${currencyParam}, o.base_currency, 'INR') as base_currency
        FROM organizations o
        WHERE o.id = ${orgId}
      ),

      -- Most recent AVERAGE rate on or before period end, per foreign currency
      period_avg_rates AS (
        SELECT DISTINCT ON (er.from_currency)
          er.from_currency,
          er.rate
        FROM exchange_rate er, org_base ob
        WHERE er.org_id = ${orgId}
          AND er.to_currency = ob.base_currency
          AND er.rate_type = 'AVERAGE'
          AND er.effective_date <= ${endDate}::date
        ORDER BY er.from_currency, er.effective_date DESC
      ),

      -- Most recent CLOSING rate before the period start (for opening balance)
      opening_close_rates AS (
        SELECT DISTINCT ON (er.from_currency)
          er.from_currency,
          er.rate
        FROM exchange_rate er, org_base ob
        WHERE er.org_id = ${orgId}
          AND er.to_currency = ob.base_currency
          AND er.rate_type = 'CLOSING'
          AND er.effective_date < ${startDate}::date
        ORDER BY er.from_currency, er.effective_date DESC
      ),

      -- Opening balance in original currency from prior-year closing postings
      previous_year_closing AS (
        SELECT
          COALESCE(p.account_id, p.credit_account_id) as account_id,
          SUM(
            CASE
              WHEN p.account_id IS NOT NULL THEN p.amount
              WHEN p.credit_account_id IS NOT NULL THEN -p.amount
              ELSE 0
            END
          ) as opening_balance_orig
        FROM posting p
        WHERE p.name LIKE 'Closing Balance%'
          AND p.posting_date BETWEEN ${prevYearStart}::date AND ${prevYearEnd}::date
          AND p.org_id = ${orgId}
        GROUP BY COALESCE(p.account_id, p.credit_account_id)
      ),

      -- Per-account period activity in original currency (includes currency)
      rolled_up_balances AS (
        SELECT
          ah.id as account_id,
          ah.classification as classification,
          ah.path as account_path,
          ah.name as account_name,
          ah.type as account_type,
          ah.level,
          ah.parent_account_id,
          ah.currency as account_currency,
          COALESCE(SUM(ab.debit_amount), 0) as total_debits_orig,
          COALESCE(SUM(ab.credit_amount), 0) as total_credits_orig,
          CASE
            WHEN ah.classification IN ('Assets', 'Expense') THEN
              SUM(ab.debit_amount - ab.credit_amount)
            WHEN ah.classification IN ('Liabilities', 'Equity', 'Income') THEN
              SUM(ab.credit_amount - ab.debit_amount)
            ELSE
              0
          END AS balance_orig
        FROM account_hierarchy ah
        LEFT JOIN account_balances ab ON ah.id = ab.account_id
          AND ab.org_id = ah.org_id
          AND ab.value_date BETWEEN ${startDate}::date AND ${endDate}::date
        WHERE ah.org_id = ${orgId} ${accountId ? Prisma.sql`AND ah.id = ${accountId}` : Prisma.empty}
          ${legalEntityIds?.length ? Prisma.sql`AND ah.legal_entity_id = ANY(${legalEntityIds})` : Prisma.empty}
        GROUP BY ah.id, ah.classification, ah.path, ah.name, ah.type,
                 ah.level, ah.parent_account_id, ah.currency
      ),

      -- Convert each account's amounts to base currency
      converted_balances AS (
        SELECT
          rb.*,
          CASE
            WHEN rb.account_currency IS NULL
              OR rb.account_currency = (SELECT base_currency FROM org_base)
            THEN 1::numeric
            ELSE COALESCE(par.rate, 1)
          END as period_rate,
          CASE
            WHEN rb.account_currency IS NULL
              OR rb.account_currency = (SELECT base_currency FROM org_base)
            THEN 1::numeric
            ELSE COALESCE(ocr.rate, 1)
          END as opening_rate,
          rb.total_debits_orig * CASE
            WHEN rb.account_currency IS NULL
              OR rb.account_currency = (SELECT base_currency FROM org_base)
            THEN 1::numeric ELSE COALESCE(par.rate, 1)
          END as total_debits,
          rb.total_credits_orig * CASE
            WHEN rb.account_currency IS NULL
              OR rb.account_currency = (SELECT base_currency FROM org_base)
            THEN 1::numeric ELSE COALESCE(par.rate, 1)
          END as total_credits,
          rb.balance_orig * CASE
            WHEN rb.account_currency IS NULL
              OR rb.account_currency = (SELECT base_currency FROM org_base)
            THEN 1::numeric ELSE COALESCE(par.rate, 1)
          END as balance,
          COALESCE(pyc.opening_balance_orig, 0) * CASE
            WHEN rb.account_currency IS NULL
              OR rb.account_currency = (SELECT base_currency FROM org_base)
            THEN 1::numeric ELSE COALESCE(ocr.rate, 1)
          END as opening_balance
        FROM rolled_up_balances rb
        LEFT JOIN period_avg_rates par ON rb.account_currency = par.from_currency
        LEFT JOIN opening_close_rates ocr ON rb.account_currency = ocr.from_currency
        LEFT JOIN previous_year_closing pyc ON rb.account_id = pyc.account_id
      ),

      -- Roll up CONVERTED amounts to parent accounts
      parent_totals AS (
        SELECT
          ah.id,
          SUM(cb.balance) as rolled_up_balance,
          SUM(cb.total_debits) as rolled_up_debits,
          SUM(cb.total_credits) as rolled_up_credits
        FROM account_hierarchy ah
        LEFT JOIN converted_balances cb
          ON cb.account_path LIKE ah.path || '%'
          AND cb.account_path != ah.path
        WHERE ah.org_id = ${orgId}
        GROUP BY ah.id
      ),

      -- Roll up CONVERTED opening balances to parent accounts
      parent_opening_totals AS (
        SELECT
          ah.id,
          SUM(cb.opening_balance) as rolled_up_opening_balance
        FROM account_hierarchy ah
        LEFT JOIN converted_balances cb
          ON cb.account_path LIKE ah.path || '%'
          AND cb.account_path != ah.path
        WHERE ah.org_id = ${orgId}
        GROUP BY ah.id
      )

      SELECT
        cb.account_id,
        cb.classification,
        cb.account_path,
        cb.account_name,
        cb.account_type,
        cb.level,
        cb.parent_account_id,
        cb.account_currency,
        (SELECT base_currency FROM org_base) as report_currency,
        cb.period_rate,
        cb.opening_rate,
        COALESCE(cb.total_debits, 0) + COALESCE(pt.rolled_up_debits, 0) as total_debits,
        COALESCE(cb.total_credits, 0) + COALESCE(pt.rolled_up_credits, 0) as total_credits,
        COALESCE(cb.balance, 0) + COALESCE(pt.rolled_up_balance, 0) as balance,
        COALESCE(cb.opening_balance, 0) + COALESCE(pot.rolled_up_opening_balance, 0) as opening_balance,
        COALESCE(cb.balance, 0) + COALESCE(pt.rolled_up_balance, 0)
          + COALESCE(cb.opening_balance, 0) + COALESCE(pot.rolled_up_opening_balance, 0) as total_balance,
        cb.total_debits_orig,
        cb.total_credits_orig,
        cb.balance_orig
      FROM converted_balances cb
      LEFT JOIN parent_totals pt ON cb.account_id = pt.id
      LEFT JOIN parent_opening_totals pot ON cb.account_id = pot.id
      ORDER BY cb.account_path`;

  return trialBalance;
};

export const getNetworthForAssets = async (
  startDate: string,
  endDate: string,
  orgId: string
): Promise<any> => {
  const networth = await prisma.$queryRaw<IncomeStatementRow[]>`
  WITH account_balances AS (
    SELECT 
     ah.id as account_id,
     ah.classification as classification,
     ah.path as account_path,
     ah.name as account_name,
     ah.type as account_type,
     ah.level,
     ah.parent_account_id,
     COALESCE(SUM(
      CASE 
       WHEN p.account_id = ah.id THEN p.amount 
       WHEN p.credit_account_id = ah.id THEN -p.amount
       ELSE 0 
      END
     ), 0) as balance
    FROM account_hierarchy ah
    LEFT JOIN posting p ON (p.account_id = ah.id OR p.credit_account_id = ah.id) AND p.value_date BETWEEN ${startDate}::date AND ${endDate}::date
    WHERE ah.org_id = ${orgId}
    -- AND ah.classification IN ('Assets')   
    GROUP BY ah.id, ah.classification, ah.path, ah.name, ah.type, ah.level, ah.parent_account_id
   ),
   parent_totals AS (
    SELECT 
     ah.id,
     SUM(ab.balance) as rolled_up_balance
    FROM account_hierarchy ah
    LEFT JOIN account_balances ab ON ab.parent_account_id = ah.id
    WHERE ah.org_id = ${orgId}
    GROUP BY ah.id
   )
   SELECT 
    ab.account_id,
    ab.classification,
    ab.account_path,
    ab.account_name,
    ab.account_type,
    ab.level,
    ab.parent_account_id,
    COALESCE(ab.balance, 0) + COALESCE(pt.rolled_up_balance, 0) as balance
   FROM account_balances ab
   LEFT JOIN parent_totals pt ON ab.account_id = pt.id
   WHERE level = 0
   ORDER BY ab.account_path;`;

  return networth;
};

export const getNetworthForLiabilities = async (
  startDate: string,
  endDate: string,
  orgId: string
): Promise<any> => {
  const networth = await prisma.$queryRaw<IncomeStatementRow[]>`
  WITH account_balances AS (
    SELECT 
     ah.id as account_id,
     ah.classification as classification,
     ah.path as account_path,
     ah.name as account_name,
     ah.type as account_type,
     ah.level,
     ah.parent_account_id,
     COALESCE(SUM(
      CASE 
       WHEN p.account_id = ah.id THEN p.amount 
       WHEN p.credit_account_id = ah.id THEN -p.amount
       ELSE 0 
      END
     ), 0) as balance
    FROM account_hierarchy ah
    LEFT JOIN posting p ON (p.account_id = ah.id OR p.credit_account_id = ah.id) AND p.value_date BETWEEN ${startDate}::date AND ${endDate}::date
    WHERE ah.org_id = ${orgId}
    AND ah.classification IN ('Liabilities')    
    GROUP BY ah.id, ah.classification, ah.path, ah.name, ah.type, ah.level, ah.parent_account_id
   ),
   parent_totals AS (
    SELECT 
     ah.id,
     SUM(ab.balance) as rolled_up_balance
    FROM account_hierarchy ah
    LEFT JOIN account_balances ab ON ab.parent_account_id = ah.id
    WHERE ah.org_id = ${orgId}
    GROUP BY ah.id
   )
    SELECT 
    account_type,
    sum(COALESCE(ab.balance, 0) + COALESCE(pt.rolled_up_balance, 0)) as balance
   FROM account_balances ab
   LEFT JOIN parent_totals pt ON ab.account_id = pt.id
   where level = 1
   group by ab.account_type;`;

  return networth;
};

interface FinancialRatioResult {
  ratio_name: string;
  ratio_value: number;
  target_value: string;
  status: 'good' | 'warning' | 'bad';
}

export const getSavingRatio = async (
  startDate: string,
  endDate: string,
  orgId: string
): Promise<FinancialRatioResult[]> => {
  const result = await prisma.$queryRaw<FinancialRatioResult[]>`
    WITH 
    income_total AS (
      SELECT COALESCE(SUM(
        CASE 
          WHEN p.account_id = ah.id THEN p.amount 
          WHEN p.credit_account_id = ah.id THEN -p.amount
          ELSE 0 
        END
      ), 0) as total_income
      FROM account_hierarchy ah
      LEFT JOIN posting p ON (p.account_id = ah.id OR p.credit_account_id = ah.id)
      WHERE ah.org_id = ${orgId}
      AND p.value_date BETWEEN ${startDate}::date AND ${endDate}::date
      AND ah.classification = 'Income'
    ),
    expense_total AS (
      SELECT COALESCE(ABS(SUM(
        CASE 
          WHEN p.account_id = ah.id THEN p.amount 
          WHEN p.credit_account_id = ah.id THEN -p.amount
          ELSE 0 
        END
      )), 0) as total_expenses
      FROM account_hierarchy ah
      LEFT JOIN posting p ON (p.account_id = ah.id OR p.credit_account_id = ah.id)
      WHERE ah.org_id = ${orgId}
      AND p.value_date BETWEEN ${startDate}::date AND ${endDate}::date
      AND ah.classification = 'Expense'
    )
    SELECT 
      'Saving' as ratio_name,
      CASE 
        WHEN i.total_income = 0 THEN 0
        ELSE ((i.total_income - e.total_expenses) / i.total_income) * 100 
      END as ratio_value,
      '> 25% for single income, > 50% for double income' as target_value,
      CASE 
        WHEN i.total_income = 0 THEN 'warning'
        WHEN ((i.total_income - e.total_expenses) / i.total_income) * 100 >= 25 THEN 'good'
        ELSE 'bad'
      END as status
    FROM income_total i, expense_total e
  `;

  return [result[0]];
};

export const getFinancialRatios = async (
  startDate: string,
  endDate: string,
  orgId: string
): Promise<FinancialRatioResult[]> => {
  const results = await prisma.$queryRaw<FinancialRatioResult[]>`
    WITH 
      rolled_up_balances AS (
        SELECT 
          ah.id AS account_id,
          ah.classification AS classification,
          ah.path AS account_path,
          ah.name AS account_name,
          ah.type AS account_type,
          ah.level,
          ah.parent_account_id,
          COALESCE(SUM(ab.debit_amount), 0) AS total_debits,
          COALESCE(SUM(ab.credit_amount), 0) AS total_credits,
          CASE
            WHEN ah.classification IN ('Assets', 'Expense') THEN
              SUM(ab.debit_amount - ab.credit_amount)
            WHEN ah.classification IN ('Liabilities', 'Equity', 'Income') THEN
              SUM(ab.credit_amount - ab.debit_amount)
            ELSE
              0
          END AS balance
        FROM account_hierarchy ah
        LEFT JOIN account_balances ab 
          ON ah.id = ab.account_id 
          AND ab.value_date BETWEEN ${startDate}::date AND ${endDate}::date
        WHERE ah.org_id = ${orgId}  
        GROUP BY ah.id, ah.classification, ah.path, ah.name, ah.type, ah.level, ah.parent_account_id
      ),

      parent_totals AS (
        SELECT 
          ah.id,
          SUM(rb.balance) AS rolled_up_balance,
          SUM(rb.total_debits) AS rolled_up_debits,
          SUM(rb.total_credits) AS rolled_up_credits
        FROM account_hierarchy ah
        LEFT JOIN rolled_up_balances rb 
          ON rb.account_path LIKE ah.path || '%'
          AND rb.account_path != ah.path
        WHERE ah.org_id = ${orgId}
        GROUP BY ah.id
      ),  

      classification_totals AS (
        SELECT 
          rb.classification,
          SUM(COALESCE(rb.balance, 0) + COALESCE(pt.rolled_up_balance, 0)) AS total_balance
        FROM rolled_up_balances rb
        LEFT JOIN parent_totals pt ON rb.account_id = pt.id
        WHERE rb.level = 0
        GROUP BY rb.classification
      ),

      depreciating_assets AS (
        SELECT 
          SUM(COALESCE(rb.balance, 0) + COALESCE(pt.rolled_up_balance, 0)) AS total_balance
        FROM rolled_up_balances rb
        LEFT JOIN parent_totals pt ON rb.account_id = pt.id
        WHERE rb.level = 0 
          AND 'DA' = ANY(rb.account_type)
      ),

      fixed_personal_large_assets AS (
        SELECT 
          SUM(COALESCE(rb.balance, 0) + COALESCE(pt.rolled_up_balance, 0)) AS total_balance
        FROM rolled_up_balances rb
        LEFT JOIN parent_totals pt ON rb.account_id = pt.id
        WHERE rb.level = 0 
          AND 'FPA' = ANY(rb.account_type)
      ),

      financial_obligations AS (
        SELECT 
          SUM(COALESCE(rb.balance, 0) + COALESCE(pt.rolled_up_balance, 0)) AS total_balance
        FROM rolled_up_balances rb
        LEFT JOIN parent_totals pt ON rb.account_id = pt.id
        WHERE rb.level = 0 
          AND 'FO' = ANY(rb.account_type)
      ),

      liquid_assets AS (
        SELECT 
          SUM(COALESCE(rb.balance, 0) + COALESCE(pt.rolled_up_balance, 0)) AS total_balance
        FROM rolled_up_balances rb
        LEFT JOIN parent_totals pt ON rb.account_id = pt.id
        WHERE rb.level = 0 
          AND 'LA' = ANY(rb.account_type)
      ),
      
      monthly_income AS (
        SELECT 
          SUM(COALESCE(rb.balance, 0) + COALESCE(pt.rolled_up_balance, 0)) AS total_balance
        FROM rolled_up_balances rb
        LEFT JOIN parent_totals pt ON rb.account_id = pt.id
        WHERE  'M' = ANY(rb.account_type)
      ),
      
      classification_summary AS (
        SELECT 
          COALESCE(SUM(CASE WHEN classification = 'Income' THEN total_balance END), 0) AS total_income,
          COALESCE(SUM(CASE WHEN classification = 'Expense' THEN total_balance END), 0) AS total_expense,
          COALESCE(SUM(CASE WHEN classification = 'Assets' THEN total_balance END), 0) AS total_asset,
          COALESCE(SUM(CASE WHEN classification = 'Liabilities' THEN total_balance END), 0) AS total_liability
        FROM classification_totals
      )

    SELECT 
      cs.total_income,
      cs.total_expense,
      cs.total_asset,
      cs.total_liability,
      (cs.total_asset - cs.total_liability) AS net_worth,
      COALESCE(da.total_balance, 0) AS total_automobiles_home_furnishings,
      COALESCE(fpla.total_balance, 0) AS total_fixed_personal_large_assets,
      COALESCE(fo.total_balance, 0) AS total_financial_obligations,
      COALESCE(la.total_balance, 0) AS total_liquid_assets,
      CASE 
        WHEN cs.total_income = 0 THEN 0
        ELSE ((cs.total_income - cs.total_expense) / NULLIF(cs.total_income, 0)) * 100 
      END AS saving_ratio,
      CASE 
        WHEN cs.total_expense = 0 THEN 0
        ELSE (cs.total_asset - COALESCE(fpla.total_balance, 0)) / NULLIF(cs.total_expense, 0)
      END AS preparedness_ratio,
      CASE 
        WHEN cs.total_asset = 0 THEN 0
        ELSE (cs.total_asset - COALESCE(fpla.total_balance, 0)) / NULLIF(cs.total_asset, 0)
      END AS financial_assets_ratio,
      CASE 
        WHEN (cs.total_asset - COALESCE(da.total_balance, 0)) = 0 THEN 0
        ELSE cs.total_liability / NULLIF(cs.total_asset - COALESCE(da.total_balance, 0), 0)
      END AS leverage_ratio,
      CASE 
        WHEN (cs.total_asset - COALESCE(da.total_balance, 0)) = 0 THEN 0
        ELSE 100 - (cs.total_liability / NULLIF(cs.total_asset - COALESCE(da.total_balance, 0), 0)) * 100
      END AS solvency_ratio,
      CASE 
        WHEN (cs.total_asset - cs.total_liability) = 0 THEN 0
        ELSE COALESCE(la.total_balance, 0) / NULLIF(cs.total_asset - cs.total_liability, 0)
      END AS liquidity_ratio,
      CASE 
        WHEN cs.total_expense = 0 THEN 0
        ELSE ROUND(COALESCE(la.total_balance, 0) * 12 / NULLIF(cs.total_expense, 0), 1)
      END AS risk_liquidity_ratio,
      COALESCE(mi.total_balance, 0) / NULLIF(fo.total_balance, 0) AS coverage_ratio
    FROM classification_summary cs
    CROSS JOIN depreciating_assets da
    CROSS JOIN fixed_personal_large_assets fpla
    CROSS JOIN financial_obligations fo
    CROSS JOIN liquid_assets la
    CROSS JOIN monthly_income mi;
  `;

  return results;
};


interface AssetCategoryResult {
  category: string;
  total_value: number;
  percentage: number;
}

export async function getAssetsTotal(startDate: string, endDate: string, orgId: string) {
  const results = await prisma.$queryRaw<AssetCategoryResult[]>`
    WITH 
      rolled_up_balances AS (
        SELECT 
          ah.id AS account_id,
          ah.classification AS classification,
          ah.path AS account_path,
          ah.name AS account_name,
          ah.type AS account_type,
          ah.level,
          ah.parent_account_id,
          COALESCE(SUM(ab.debit_amount), 0) AS total_debits,
          COALESCE(SUM(ab.credit_amount), 0) AS total_credits,
          CASE
            WHEN ah.classification IN ('Assets', 'Expense') THEN
              SUM(ab.debit_amount - ab.credit_amount)
            WHEN ah.classification IN ('Liabilities', 'Equity', 'Income') THEN
              SUM(ab.credit_amount - ab.debit_amount)
            ELSE
              0
          END AS balance
        FROM account_hierarchy ah
        LEFT JOIN account_balances ab 
          ON ah.id = ab.account_id 
          AND ab.value_date BETWEEN ${startDate}::date AND ${endDate}::date
        WHERE ah.org_id = ${orgId}
          AND ah.classification = 'Assets'
        GROUP BY ah.id, ah.classification, ah.path, ah.name, ah.type, ah.level, ah.parent_account_id
      ),

      parent_totals AS (
        SELECT 
          ah.id,
          SUM(rb.balance) AS rolled_up_balance,
          SUM(rb.total_debits) AS rolled_up_debits,
          SUM(rb.total_credits) AS rolled_up_credits
        FROM account_hierarchy ah
        LEFT JOIN rolled_up_balances rb 
          ON rb.account_path LIKE ah.path || '%'
          AND rb.account_path != ah.path
        WHERE ah.org_id = ${orgId}
        GROUP BY ah.id
      ),

      asset_balances_final AS (
        SELECT 
          rb.account_id,
          rb.account_name,
          rb.account_path,
          rb.level,
          COALESCE(rb.balance, 0) + COALESCE(pt.rolled_up_balance, 0) AS balance
        FROM rolled_up_balances rb
        LEFT JOIN parent_totals pt ON rb.account_id = pt.id
        WHERE rb.level = 0
      ),

      total_assets AS (
        SELECT SUM(balance) as total_value 
        FROM asset_balances_final
      ),

      category_map AS (
        SELECT 
          ab.*,
          CASE 
            WHEN ab.account_path ILIKE '%Liquid and Equivalents%' OR ab.account_path ILIKE '%Bank and Cash%' THEN 'Liquid and Equivalents'
            WHEN ab.account_path ILIKE '%Investments%' THEN 'Investments'
            WHEN ab.account_path ILIKE '%Fixed, Personal and Large%' THEN 'Personal'
            WHEN ab.account_path ILIKE '%Retirement%' THEN 'Retirement'
          END AS category
        FROM asset_balances_final ab
      ),

      category_sums AS (
        SELECT 
          category,
          SUM(balance) as total_value
        FROM category_map
        WHERE category IS NOT NULL
        GROUP BY category
      )

    SELECT 
      cs.category,
      cs.total_value,
      CASE 
        WHEN ta.total_value = 0 THEN 0
        ELSE ROUND((cs.total_value / ta.total_value) * 100, 2)
      END as percentage
    FROM category_sums cs
    CROSS JOIN total_assets ta
    ORDER BY cs.total_value DESC;
  `;

  return results;
}

export async function getAssetsBreakdown(startDate: string, endDate: string, orgId: string) {
  const results = await prisma.$queryRaw<AssetAccountBreakdown[]>`
    WITH 
      rolled_up_balances AS (
        SELECT 
          ah.id AS account_id,
          ah.classification AS classification,
          ah.path AS account_path,
          ah.name AS account_name,
          ah.type AS account_type,
          ah.level,
          ah.parent_account_id,
          COALESCE(SUM(ab.debit_amount), 0) AS total_debits,
          COALESCE(SUM(ab.credit_amount), 0) AS total_credits,
          CASE
            WHEN ah.classification IN ('Assets', 'Expense') THEN
              SUM(ab.debit_amount - ab.credit_amount)
            WHEN ah.classification IN ('Liabilities', 'Equity', 'Income') THEN
              SUM(ab.credit_amount - ab.debit_amount)
            ELSE
              0
          END AS balance
        FROM account_hierarchy ah
        LEFT JOIN account_balances ab 
          ON ah.id = ab.account_id 
          AND ab.value_date BETWEEN ${startDate}::date AND ${endDate}::date
        WHERE ah.org_id = ${orgId}
          AND ah.classification = 'Assets'
        GROUP BY ah.id, ah.classification, ah.path, ah.name, ah.type, ah.level, ah.parent_account_id
      ),

      parent_totals AS (
        SELECT 
          ah.id,
          SUM(rb.balance) AS rolled_up_balance,
          SUM(rb.total_debits) AS rolled_up_debits,
          SUM(rb.total_credits) AS rolled_up_credits
        FROM account_hierarchy ah
        LEFT JOIN rolled_up_balances rb 
          ON rb.account_path LIKE ah.path || '%'
          AND rb.account_path != ah.path
        WHERE ah.org_id = ${orgId}
        GROUP BY ah.id
      ),

      asset_balances_final AS (
        SELECT 
          rb.account_id,
          rb.account_name,
          rb.account_path,
          rb.level,
          COALESCE(rb.balance, 0) + COALESCE(pt.rolled_up_balance, 0) AS balance
        FROM rolled_up_balances rb
        LEFT JOIN parent_totals pt ON rb.account_id = pt.id
        WHERE rb.level = 0
      ),

      category_map AS (
        SELECT 
          ab.*,
          CASE 
            WHEN ab.account_path ILIKE '%Liquid and Equivalents%' OR ab.account_path ILIKE '%Bank and Cash%' THEN 'Liquid and Equivalents'
            WHEN ab.account_path ILIKE '%Investments%' THEN 'Investments'
            WHEN ab.account_path ILIKE '%Fixed, Personal and Large%' THEN 'Personal'
            WHEN ab.account_path ILIKE '%Retirement%' THEN 'Retirement'
          END AS category
        FROM asset_balances_final ab
        WHERE ab.balance != 0
      ),

      category_totals AS (
        SELECT 
          category,
          SUM(balance) AS total_balance
        FROM category_map
        GROUP BY category
      )

    SELECT 
      cm.category,
      cm.account_name,
      cm.balance,
      CASE 
        WHEN ct.total_balance = 0 THEN 0
        ELSE ROUND((cm.balance / ct.total_balance) * 100, 2)
      END AS percentage
    FROM category_map cm
    JOIN category_totals ct ON cm.category = ct.category
    ORDER BY cm.category, cm.balance DESC;
  `;

  return results;
}

export async function getLiabilitiesTotal(startDate: string, endDate: string, orgId: string): Promise<LiabilityMetrics> {
  const results = await prisma.$queryRaw<LiabilityMetrics[]>`
    WITH 
      rolled_up_balances AS (
        SELECT 
          ah.id AS account_id,
          ah.classification AS classification,
          ah.path AS account_path,
          ah.name AS account_name,
          ah.type AS account_type,
          ah.level,
          ah.parent_account_id,
          COALESCE(SUM(ab.debit_amount), 0) AS total_debits,
          COALESCE(SUM(ab.credit_amount), 0) AS total_credits,
          CASE
            WHEN ah.classification IN ('Assets', 'Expense') THEN
              SUM(ab.debit_amount - ab.credit_amount)
            WHEN ah.classification IN ('Liabilities', 'Equity', 'Income') THEN
              SUM(ab.credit_amount - ab.debit_amount)
            ELSE
              0
          END AS balance
        FROM account_hierarchy ah
        LEFT JOIN account_balances ab 
          ON ah.id = ab.account_id 
          AND ab.value_date BETWEEN ${startDate}::date AND ${endDate}::date
        WHERE ah.org_id = ${orgId}
        GROUP BY ah.id, ah.classification, ah.path, ah.name, ah.type, ah.level, ah.parent_account_id
      ),

      parent_totals AS (
        SELECT 
          ah.id,
          SUM(rb.balance) AS rolled_up_balance
        FROM account_hierarchy ah
        LEFT JOIN rolled_up_balances rb 
          ON rb.account_path LIKE ah.path || '%'
          AND rb.account_path != ah.path
        WHERE ah.org_id = ${orgId}
        GROUP BY ah.id
      ),
    
      total_debt AS (
        SELECT COALESCE(ABS(SUM(
          COALESCE(rb.balance, 0) + COALESCE(pt.rolled_up_balance, 0)
        )), 0) as value
        FROM rolled_up_balances rb
        LEFT JOIN parent_totals pt ON rb.account_id = pt.id
        WHERE rb.classification = 'Liabilities' AND rb.level = 0
      ),
      
      monthly_payments AS (
        SELECT COALESCE(ABS(SUM(
          COALESCE(rb.balance, 0) + COALESCE(pt.rolled_up_balance, 0)
        )), 0) as value
        FROM rolled_up_balances rb
        LEFT JOIN parent_totals pt ON rb.account_id = pt.id
        WHERE rb.classification = 'Expense'
          AND rb.parent_account_id = 'acco_2939b1cb-99e0-4ca5-a3bb-f5c9a4d6dac5'
      ),
      
      total_income AS (
        SELECT COALESCE(ABS(SUM(
          COALESCE(rb.balance, 0) + COALESCE(pt.rolled_up_balance, 0)
        )), 0) as value
        FROM rolled_up_balances rb
        LEFT JOIN parent_totals pt ON rb.account_id = pt.id
        WHERE rb.classification = 'Income'
      )

    SELECT 
      td.value as total_debt,
      mp.value as monthly_payments,
      CASE 
        WHEN ti.value = 0 THEN 0
        ELSE ROUND((td.value / ti.value)::numeric, 2)
      END as debt_to_income_ratio
    FROM total_debt td
    CROSS JOIN monthly_payments mp
    CROSS JOIN total_income ti;
  `;

  return results[0];
}

export async function getLiabilitiesBreakdown(startDate: string, endDate: string, orgId: string): Promise<LiabilityBreakdown[]> {
  const results = await prisma.$queryRaw<LiabilityBreakdown[]>`
    WITH 
      rolled_up_balances AS (
        SELECT 
          ah.id AS account_id,
          ah.classification AS classification,
          ah.path AS account_path,
          ah.name AS account_name,
          ah.type AS account_type,
          ah.level,
          ah.parent_account_id,
          COALESCE(SUM(ab.debit_amount), 0) AS total_debits,
          COALESCE(SUM(ab.credit_amount), 0) AS total_credits,
          CASE
            WHEN ah.classification IN ('Assets', 'Expense') THEN
              SUM(ab.debit_amount - ab.credit_amount)
            WHEN ah.classification IN ('Liabilities', 'Equity', 'Income') THEN
              SUM(ab.credit_amount - ab.debit_amount)
            ELSE
              0
          END AS balance
        FROM account_hierarchy ah
        LEFT JOIN account_balances ab 
          ON ah.id = ab.account_id 
          AND ab.value_date BETWEEN ${startDate}::date AND ${endDate}::date
        WHERE ah.org_id = ${orgId}
          AND ah.classification = 'Liabilities'
        GROUP BY ah.id, ah.classification, ah.path, ah.name, ah.type, ah.level, ah.parent_account_id
      ),

      parent_totals AS (
        SELECT 
          ah.id,
          SUM(rb.balance) AS rolled_up_balance
        FROM account_hierarchy ah
        LEFT JOIN rolled_up_balances rb 
          ON rb.account_path LIKE ah.path || '%'
          AND rb.account_path != ah.path
        WHERE ah.org_id = ${orgId}
        GROUP BY ah.id
      ),

      liability_balances AS (
        SELECT 
          rb.account_id,
          rb.account_name,
          rb.account_type,
          COALESCE(rb.balance, 0) + COALESCE(pt.rolled_up_balance, 0) as balance
        FROM rolled_up_balances rb
        LEFT JOIN parent_totals pt ON rb.account_id = pt.id
        WHERE rb.level = 0
      ),
      
      type_groups AS (
        SELECT 
          CASE 
            WHEN 'US' = ANY(lb.account_type) THEN 'Unsecured'
            WHEN 'S' = ANY(lb.account_type) THEN 'Secured'
            ELSE 'Other'
          END as type,
          lb.account_name,
          lb.balance
        FROM liability_balances lb
        WHERE lb.balance != 0
      ),
      
      type_totals AS (
        SELECT 
          type,
          SUM(ABS(balance)) as total_amount
        FROM type_groups
        GROUP BY type
      ),
      
      grand_total AS (
        SELECT SUM(total_amount) as total
        FROM type_totals
      )

    SELECT 
      tg.type,
      tt.total_amount,
      CASE 
        WHEN gt.total = 0 THEN 0
        ELSE ROUND((tt.total_amount / gt.total) * 100, 2)
      END as percentage,
      json_agg(
        json_build_object(
          'name', tg.account_name,
          'amount', ABS(tg.balance)
        ) ORDER BY tg.account_name
      ) as items
    FROM type_groups tg
    JOIN type_totals tt ON tg.type = tt.type
    CROSS JOIN grand_total gt
    GROUP BY tg.type, tt.total_amount, gt.total
    ORDER BY tt.total_amount DESC;
  `;

  return results;
}

export async function getIncomeTotal(startDate: string, endDate: string, orgId: string,): Promise<IncomeDetailItem[]> {
  const results = await prisma.$queryRaw<IncomeDetailItem[]>`
    WITH income_categories AS (
      SELECT 
        CASE 
          WHEN ah.path ILIKE '%Salary%' OR ah.path ILIKE '%Base Pay%' OR ah.path ILIKE '%Fixed Pay%'
          THEN 'Salary'
          WHEN ah.path ILIKE '%Commission%' OR ah.path ILIKE '%Bonus%' OR ah.path ILIKE '%Variable Pay%'
          THEN 'Commissions/bonus'
          WHEN ah.path ILIKE '%Stock%' OR ah.path ILIKE '%RSU%' OR ah.path ILIKE '%Equity%'
          THEN 'Stocks/RSU'
          WHEN ah.path ILIKE '%Rental%' OR ah.path ILIKE '%Property Income%' OR ah.path ILIKE '%Lease Income%'
          THEN 'Rental income'
          WHEN ah.path ILIKE '%Dividend%'
          THEN 'Dividend'
          WHEN ah.path ILIKE '%Interest%'
          THEN 'Interest'
          ELSE 'Other Income'
        END as income_category,
        COALESCE(ABS(SUM(
          CASE 
            WHEN p.account_id = ah.id THEN p.amount 
            WHEN p.credit_account_id = ah.id THEN -p.amount
            ELSE 0 
          END
        )), 0) as amount
      FROM account_hierarchy ah
      LEFT JOIN posting p ON (p.account_id = ah.id OR p.credit_account_id = ah.id)
        AND p.value_date BETWEEN ${startDate}::date AND ${endDate}::date
      WHERE ah.org_id = ${orgId}
      AND ah.classification = 'Income'
      GROUP BY 
        CASE 
          WHEN ah.path ILIKE '%Salary%' OR ah.path ILIKE '%Base Pay%' OR ah.path ILIKE '%Fixed Pay%'
          THEN 'Salary'
          WHEN ah.path ILIKE '%Commission%' OR ah.path ILIKE '%Bonus%' OR ah.path ILIKE '%Variable Pay%'
          THEN 'Commissions/bonus'
          WHEN ah.path ILIKE '%Stock%' OR ah.path ILIKE '%RSU%' OR ah.path ILIKE '%Equity%'
          THEN 'Stocks/RSU'
          WHEN ah.path ILIKE '%Rental%' OR ah.path ILIKE '%Property Income%' OR ah.path ILIKE '%Lease Income%'
          THEN 'Rental income'
          WHEN ah.path ILIKE '%Dividend%'
          THEN 'Dividend'
          WHEN ah.path ILIKE '%Interest%'
          THEN 'Interest'
          ELSE 'Other Income'
        END
    ),
    total_income AS (
      SELECT SUM(amount) as total
      FROM income_categories
    )
    SELECT 
      ic.income_category as name,
      ic.amount as value,
      CASE 
        WHEN ti.total = 0 THEN 0
        ELSE ROUND((ic.amount / ti.total * 100)::numeric, 1)
      END as percentage
    FROM income_categories ic
    CROSS JOIN total_income ti
    ORDER BY ic.amount DESC;
  `;

  // Define all expected categories
  const expectedCategories = [
    'Salary',
    'Commissions/bonus',
    'Stocks/RSU',
    'Rental income',
    'Dividend',
    'Interest'
  ];

  // Ensure all categories are present, even if with zero values
  const finalResults = expectedCategories.map(category => {
    const found = results.find((r: { name: string }) => r.name === category);
    return found || { name: category, value: 0, percentage: 0 };
  });

  // Add any "Other Income" if it exists
  const otherIncome = results.find((r: { name: string }) => r.name === 'Other Income');
  if (otherIncome && otherIncome.value > 0) {
    finalResults.push(otherIncome);
  }
  return finalResults;
}

export async function getIncomeByType(startDate: string, endDate: string, orgId: string): Promise<IncomeSplitItem[]> {
  const results = await prisma.$queryRaw<IncomeSplitItem[]>`
    WITH income_categories AS (
      SELECT 
        CASE 
          WHEN ah.path ILIKE '%Investment%' OR ah.path ILIKE '%Dividend%' OR ah.path ILIKE '%Interest%' 
          THEN 'Investment Income'
          ELSE 'Income from Work'
        END as income_type,
        COALESCE(ABS(SUM(
          CASE 
            WHEN p.account_id = ah.id THEN p.amount 
            WHEN p.credit_account_id = ah.id THEN -p.amount
            ELSE 0 
          END
        )), 0) as amount
      FROM account_hierarchy ah
      LEFT JOIN posting p ON (p.account_id = ah.id OR p.credit_account_id = ah.id)
        AND p.value_date BETWEEN ${startDate}::date AND ${endDate}::date
      WHERE ah.org_id = ${orgId}
      AND ah.classification = 'Income'
      GROUP BY 
        CASE 
          WHEN ah.path ILIKE '%Investment%' OR ah.path ILIKE '%Dividend%' OR ah.path ILIKE '%Interest%' 
          THEN 'Investment Income'
          ELSE 'Income from Work'
        END
    ),
    total_income AS (
      SELECT SUM(amount) as total
      FROM income_categories
    )
    SELECT 
      ic.income_type as name,
      ic.amount as value,
      CASE 
        WHEN ti.total = 0 THEN 0
        ELSE ROUND((ic.amount / ti.total * 100)::numeric, 1)
      END as percentage
    FROM income_categories ic
    CROSS JOIN total_income ti
    ORDER BY ic.amount DESC;
  `;

  // Ensure we always return both categories even if one has zero value
  const workIncome = results.find((r: { name: string }) => r.name === 'Income from Work') ||
    { name: 'Income from Work', value: 0, percentage: 0 };
  const investmentIncome = results.find((r: { name: string }) => r.name === 'Investment Income') ||
    { name: 'Investment Income', value: 0, percentage: 0 };

  return [workIncome, investmentIncome];
}



export async function getClassificationBreakdown(
  orgId: string,
  classification: 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense'
): Promise<ClassificationBreakdownItem[]> {
  const categoryMappings = {
    Asset: [
      { name: 'Cash and Equivalents', patterns: ['Cash', 'Bank', 'Money Market', 'Checking', 'Savings'] },
      { name: 'Investments', patterns: ['Investment', 'Stocks', 'Bonds', 'Securities', 'Mutual Funds'] },
      { name: 'Real Estate', patterns: ['Real Estate', 'Property', 'Land', 'Building'] },
      { name: 'Vehicles', patterns: ['Vehicle', 'Car', 'Automobile'] },
      { name: 'Retirement Accounts', patterns: ['Retirement', '401k', 'IRA', 'Pension'] },
      { name: 'Personal Property', patterns: ['Personal', 'Furniture', 'Electronics', 'Jewelry'] }
    ],
    Liability: [
      { name: 'Mortgages', patterns: ['Mortgage', 'Home Loan', 'Property Loan'] },
      { name: 'Auto Loans', patterns: ['Auto Loan', 'Car Loan', 'Vehicle Loan'] },
      { name: 'Credit Cards', patterns: ['Credit Card', 'Card Balance'] },
      { name: 'Personal Loans', patterns: ['Personal Loan', 'Signature Loan'] },
      { name: 'Student Loans', patterns: ['Student Loan', 'Education Loan'] },
      { name: 'Business Loans', patterns: ['Business Loan', 'Commercial Loan'] }
    ],
    Equity: [
      { name: 'Owner Equity', patterns: ['Owner Equity', 'Capital'] },
      { name: 'Retained Earnings', patterns: ['Retained', 'Earnings'] },
      { name: 'Common Stock', patterns: ['Common Stock', 'Share Capital'] },
      { name: 'Additional Paid-in Capital', patterns: ['Additional Paid', 'Paid-in'] },
      { name: 'Treasury Stock', patterns: ['Treasury'] }
    ],
    Income: [
      { name: 'Salary', patterns: ['Salary', 'Base Pay', 'Fixed Pay', 'Wages'] },
      { name: 'Commissions/bonus', patterns: ['Commission', 'Bonus', 'Variable Pay', 'Performance'] },
      { name: 'Stocks/RSU', patterns: ['Stock', 'RSU', 'Equity', 'Share'] },
      { name: 'Rental income', patterns: ['Rental', 'Property Income', 'Lease Income'] },
      { name: 'Dividend', patterns: ['Dividend'] },
      { name: 'Interest', patterns: ['Interest'] }
    ],
    Expense: [
      { name: 'Housing', patterns: ['Rent', 'Mortgage', 'Property Tax', 'Home Insurance', 'Maintenance'] },
      { name: 'Transportation', patterns: ['Car', 'Gas', 'Auto Insurance', 'Public Transport', 'Parking'] },
      { name: 'Food', patterns: ['Groceries', 'Dining', 'Restaurant', 'Food'] },
      { name: 'Utilities', patterns: ['Electricity', 'Water', 'Gas', 'Internet', 'Phone'] },
      { name: 'Healthcare', patterns: ['Medical', 'Health Insurance', 'Dental', 'Vision', 'Pharmacy'] },
      { name: 'Entertainment', patterns: ['Entertainment', 'Recreation', 'Hobbies', 'Subscription'] }
    ]
  };

  const categories = categoryMappings[classification];
  const patternCases = categories
    .map(cat =>
      cat.patterns
        .map(pattern => `WHEN ah.path ILIKE '%${pattern}%' THEN '${cat.name}'`)
        .join('\n          ')
    )
    .join('\n          ');

  const results = await prisma.$queryRaw<ClassificationBreakdownItem[]>`
    WITH categorized_balances AS (
      SELECT 
        CASE 
          ${Prisma.raw(patternCases)}
          ELSE 'Other'
        END as category,
        COALESCE(ABS(SUM(
          CASE 
            WHEN p.account_id = ah.id THEN p.amount 
            WHEN p.credit_account_id = ah.id THEN -p.amount
            ELSE 0 
          END
        )), 0) as amount
      FROM account_hierarchy ah
      LEFT JOIN posting p ON (p.account_id = ah.id OR p.credit_account_id = ah.id)
      WHERE ah.org_id = ${orgId}
      AND ah.classification = ${classification}
      GROUP BY 
        CASE 
          ${Prisma.raw(patternCases)}
          ELSE 'Other'
        END
    ),
    total_amount AS (
      SELECT SUM(amount) as total
      FROM categorized_balances
    )
    SELECT 
      cb.category as name,
      cb.amount as value,
      CASE 
        WHEN ta.total = 0 THEN 0
        ELSE ROUND((cb.amount / ta.total * 100)::numeric, 1)
      END as percentage
    FROM categorized_balances cb
    CROSS JOIN total_amount ta
    ORDER BY cb.amount DESC;
  `;

  // Ensure all expected categories are present
  const finalResults = categories.map(category => {
    const found = results.find((r: { name: string }) => r.name === category.name);
    return found || { name: category.name, value: 0, percentage: 0 };
  });

  // Add "Other" category if it exists with non-zero value
  const otherCategory = results.find((r: { name: string }) => r.name === 'Other');
  if (otherCategory && otherCategory.value > 0) {
    finalResults.push(otherCategory);
  }

  return finalResults;
}
