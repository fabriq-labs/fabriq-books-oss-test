-- Database views for reporting (trial balance, account rollups).
-- Apply via: npx ts-node prisma/apply-database-views.ts
-- Order matters: account_hierarchy must be created before views that reference it.

-- public.account_hierarchy source

CREATE OR REPLACE VIEW public.account_hierarchy
AS WITH RECURSIVE hierarchy AS (
         SELECT account.id,
            account.code,
            account.classification,
            account.name,
            account.type,
            account.parent_account_id,
            account.name::character varying(1000) AS path,
            0 AS level,
            account.org_id,
            account.base_currency_id AS currency,
            account.legal_entity_id
           FROM account
          WHERE account.parent_account_id = ''::text OR account.parent_account_id IS NULL
        UNION ALL
         SELECT a.id,
            a.code,
            a.classification,
            a.name,
            a.type,
            a.parent_account_id,
            (((ah.path::text || ' -> '::text) || a.name))::character varying(1000) AS "varchar",
            ah.level + 1,
            a.org_id,
            a.base_currency_id AS currency,
            a.legal_entity_id
           FROM account a
             JOIN hierarchy ah ON a.parent_account_id = ah.id::text
        )
 SELECT id,
    code,
    classification,
    name,
    type,
    parent_account_id,
    path,
    level,
    org_id,
    currency,
    legal_entity_id
   FROM hierarchy;


-- public.account_balances source

CREATE OR REPLACE VIEW public.account_balances
AS WITH all_balances AS (
         SELECT ah.id AS account_id,
            ah.classification,
            ah.path AS account_path,
            ah.name AS account_name,
            ah.type AS account_type,
            ah.level,
            ah.parent_account_id,
            p.value_date,
            p.name,
            ah.org_id,
            sum(COALESCE(p.amount, 0::numeric)) AS debit_amount,
            0 AS credit_amount
           FROM account_hierarchy ah
             LEFT JOIN posting p ON ah.id::text = p.account_id AND p.org_id = ah.org_id
                AND COALESCE(p.status, 'ACTIVE') NOT IN ('REVERSED', 'DUPLICATE')
                AND p.reversal_of_posting_id IS NULL
                AND COALESCE(p.posting_type, '') <> 'DUPLICATE'
          GROUP BY ah.id, ah.classification, ah.path, ah.name, ah.type, ah.level, ah.parent_account_id, p.value_date, p.name, ah.org_id
        UNION ALL
         SELECT ah.id AS account_id,
            ah.classification,
            ah.path AS account_path,
            ah.name AS account_name,
            ah.type AS account_type,
            ah.level,
            ah.parent_account_id,
            p.value_date,
            p.name,
            ah.org_id,
            0 AS debit_amount,
            sum(COALESCE(p.amount, 0::numeric)) AS credit_amount
           FROM account_hierarchy ah
             LEFT JOIN posting p ON ah.id::text = p.credit_account_id AND p.org_id = ah.org_id
                AND COALESCE(p.status, 'ACTIVE') NOT IN ('REVERSED', 'DUPLICATE')
                AND p.reversal_of_posting_id IS NULL
                AND COALESCE(p.posting_type, '') <> 'DUPLICATE'
          GROUP BY ah.id, ah.classification, ah.path, ah.name, ah.type, ah.level, ah.parent_account_id, p.value_date, p.name, ah.org_id
        )
 SELECT account_id,
    classification,
    account_path,
    account_name,
    account_type,
    level,
    parent_account_id,
    value_date,
    name,
    org_id,
    debit_amount,
    credit_amount
   FROM all_balances
  WHERE name !~~ 'Clos%'::text OR name IS NULL;

-- public.account_balances_complete source

CREATE OR REPLACE VIEW public.account_balances_complete
AS WITH all_accounts AS (
         SELECT DISTINCT ah.id AS account_id,
            ah.classification,
            ah.path AS account_path,
            ah.name AS account_name,
            ah.type AS account_type,
            ah.level,
            ah.parent_account_id,
            ah.org_id,
            p.value_date
           FROM account_hierarchy ah
             CROSS JOIN ( SELECT DISTINCT posting.value_date
                   FROM posting
                  WHERE posting.value_date IS NOT NULL
                    AND COALESCE(posting.status, 'ACTIVE') NOT IN ('REVERSED', 'DUPLICATE')
                    AND posting.reversal_of_posting_id IS NULL
                    AND COALESCE(posting.posting_type, '') <> 'DUPLICATE') p
        ), account_postings AS (
         SELECT ah.id AS account_id,
            ah.classification,
            ah.path AS account_path,
            ah.name AS account_name,
            ah.type AS account_type,
            ah.level,
            ah.parent_account_id,
            ah.org_id,
            p.value_date,
            COALESCE(sum(
                CASE
                    WHEN p.account_id = ah.id::text THEN p.amount
                    ELSE 0::numeric
                END), 0::numeric) AS debit_amount,
            COALESCE(sum(
                CASE
                    WHEN p.credit_account_id = ah.id::text THEN p.amount
                    ELSE 0::numeric
                END), 0::numeric) AS credit_amount,
            COALESCE(sum(
                CASE
                    WHEN p.account_id = ah.id::text THEN p.amount
                    ELSE 0::numeric
                END), 0::numeric) - COALESCE(sum(
                CASE
                    WHEN p.credit_account_id = ah.id::text THEN p.amount
                    ELSE 0::numeric
                END), 0::numeric) AS net_balance
           FROM account_hierarchy ah
             LEFT JOIN posting p ON (p.account_id = ah.id::text OR p.credit_account_id = ah.id::text) AND (p.name !~~ 'Clos%'::text OR p.name IS NULL)
                AND COALESCE(p.status, 'ACTIVE') NOT IN ('REVERSED', 'DUPLICATE')
                AND p.reversal_of_posting_id IS NULL
                AND COALESCE(p.posting_type, '') <> 'DUPLICATE'
          GROUP BY ah.id, ah.classification, ah.path, ah.name, ah.type, ah.level, ah.parent_account_id, ah.org_id, p.value_date
        ), account_balances_combined AS (
         SELECT aa.account_id,
            aa.classification,
            aa.account_path,
            aa.account_name,
            aa.account_type,
            aa.level,
            aa.parent_account_id,
            aa.org_id,
            aa.value_date,
            COALESCE(ap.debit_amount, 0::numeric) AS debit_amount,
            COALESCE(ap.credit_amount, 0::numeric) AS credit_amount,
            COALESCE(ap.net_balance, 0::numeric) AS net_balance
           FROM all_accounts aa
             LEFT JOIN account_postings ap ON aa.account_id::text = ap.account_id::text AND aa.value_date = ap.value_date
        ), account_balances_with_running AS (
         SELECT account_balances_combined.account_id,
            account_balances_combined.classification,
            account_balances_combined.account_path,
            account_balances_combined.account_name,
            account_balances_combined.account_type,
            account_balances_combined.level,
            account_balances_combined.parent_account_id,
            account_balances_combined.org_id,
            account_balances_combined.value_date,
            account_balances_combined.debit_amount,
            account_balances_combined.credit_amount,
            account_balances_combined.net_balance,
            sum(account_balances_combined.net_balance) OVER (PARTITION BY account_balances_combined.account_id ORDER BY account_balances_combined.value_date ROWS UNBOUNDED PRECEDING) AS running_balance
           FROM account_balances_combined
        ), rolled_up_balances AS (
         SELECT abd.account_id,
            abd.classification,
            abd.account_path,
            abd.account_name,
            abd.account_type,
            abd.level,
            abd.parent_account_id,
            abd.org_id,
            abd.value_date,
            abd.debit_amount,
            abd.credit_amount,
            abd.net_balance,
            abd.running_balance,
            COALESCE(( SELECT sum(child.running_balance) AS sum
                   FROM account_balances_with_running child
                  WHERE child.parent_account_id = abd.account_id::text AND child.value_date <= abd.value_date), 0::numeric) AS child_balance,
            abd.running_balance + COALESCE(( SELECT sum(child.running_balance) AS sum
                   FROM account_balances_with_running child
                  WHERE child.parent_account_id = abd.account_id::text AND child.value_date <= abd.value_date), 0::numeric) AS total_running_balance
           FROM account_balances_with_running abd
        )
 SELECT account_id,
    classification,
    account_path,
    account_name,
    account_type,
    level,
    parent_account_id,
    org_id,
    value_date,
    debit_amount,
    credit_amount,
    net_balance,
    running_balance,
    child_balance,
    total_running_balance
   FROM rolled_up_balances
  ORDER BY account_name, value_date;



  -- public.account_balances_fixed source

CREATE OR REPLACE VIEW public.account_balances_fixed
AS WITH account_totals AS (
         SELECT ah.id AS account_id,
            ah.classification,
            ah.path AS account_path,
            ah.name AS account_name,
            ah.type AS account_type,
            ah.level,
            ah.parent_account_id,
            ah.org_id,
            COALESCE(sum(
                CASE
                    WHEN p.account_id = ah.id::text THEN p.amount
                    ELSE 0::numeric
                END), 0::numeric) AS debit_amount,
            COALESCE(sum(
                CASE
                    WHEN p.credit_account_id = ah.id::text THEN p.amount
                    ELSE 0::numeric
                END), 0::numeric) AS credit_amount,
            COALESCE(sum(
                CASE
                    WHEN p.account_id = ah.id::text THEN p.amount
                    ELSE 0::numeric
                END), 0::numeric) - COALESCE(sum(
                CASE
                    WHEN p.credit_account_id = ah.id::text THEN p.amount
                    ELSE 0::numeric
                END), 0::numeric) AS net_balance
           FROM account_hierarchy ah
             LEFT JOIN posting p ON (p.account_id = ah.id::text OR p.credit_account_id = ah.id::text)
                AND COALESCE(p.status, 'ACTIVE') NOT IN ('REVERSED', 'DUPLICATE')
                AND p.reversal_of_posting_id IS NULL
                AND COALESCE(p.posting_type, '') <> 'DUPLICATE'
          WHERE p.name !~~ 'Clos%'::text OR p.name IS NULL
          GROUP BY ah.id, ah.classification, ah.path, ah.name, ah.type, ah.level, ah.parent_account_id, ah.org_id
        ), rolled_up_balances AS (
         SELECT at.account_id,
            at.classification,
            at.account_path,
            at.account_name,
            at.account_type,
            at.level,
            at.parent_account_id,
            at.org_id,
            at.debit_amount,
            at.credit_amount,
            at.net_balance,
            COALESCE(child_rollup.child_balance, 0::numeric) AS child_balance,
            at.net_balance + COALESCE(child_rollup.child_balance, 0::numeric) AS total_balance
           FROM account_totals at
             LEFT JOIN ( SELECT parent.parent_account_id,
                    sum(child.net_balance + COALESCE(grandchild.child_balance, 0::numeric)) AS child_balance
                   FROM account_totals parent
                     JOIN account_totals child ON child.parent_account_id = parent.account_id::text
                     LEFT JOIN ( SELECT grandparent.parent_account_id,
                            sum(grandchild_1.net_balance) AS child_balance
                           FROM account_totals grandparent
                             JOIN account_totals grandchild_1 ON grandchild_1.parent_account_id = grandparent.account_id::text
                          GROUP BY grandparent.parent_account_id) grandchild ON grandchild.parent_account_id = child.account_id::text
                  GROUP BY parent.parent_account_id) child_rollup ON child_rollup.parent_account_id = at.account_id::text
        )
 SELECT account_id,
    classification,
    account_path,
    account_name,
    account_type,
    level,
    parent_account_id,
    org_id,
    debit_amount,
    credit_amount,
    net_balance,
    child_balance,
    total_balance
   FROM rolled_up_balances
  ORDER BY level, account_name;



  -- public.account_balances_with_dates source

CREATE OR REPLACE VIEW public.account_balances_with_dates
AS WITH account_totals_by_date AS (
         SELECT ah.id AS account_id,
            ah.classification,
            ah.path AS account_path,
            ah.name AS account_name,
            ah.type AS account_type,
            ah.level,
            ah.parent_account_id,
            ah.org_id,
            p.value_date,
            COALESCE(sum(
                CASE
                    WHEN p.account_id = ah.id::text THEN p.amount
                    ELSE 0::numeric
                END), 0::numeric) AS debit_amount,
            COALESCE(sum(
                CASE
                    WHEN p.credit_account_id = ah.id::text THEN p.amount
                    ELSE 0::numeric
                END), 0::numeric) AS credit_amount,
            COALESCE(sum(
                CASE
                    WHEN p.account_id = ah.id::text THEN p.amount
                    ELSE 0::numeric
                END), 0::numeric) - COALESCE(sum(
                CASE
                    WHEN p.credit_account_id = ah.id::text THEN p.amount
                    ELSE 0::numeric
                END), 0::numeric) AS net_balance
           FROM account_hierarchy ah
             LEFT JOIN posting p ON (p.account_id = ah.id::text OR p.credit_account_id = ah.id::text)
                AND COALESCE(p.status, 'ACTIVE') NOT IN ('REVERSED', 'DUPLICATE')
                AND p.reversal_of_posting_id IS NULL
                AND COALESCE(p.posting_type, '') <> 'DUPLICATE'
          WHERE p.name !~~ 'Clos%'::text OR p.name IS NULL
          GROUP BY ah.id, ah.classification, ah.path, ah.name, ah.type, ah.level, ah.parent_account_id, ah.org_id, p.value_date
        ), account_balances_with_running AS (
         SELECT account_totals_by_date.account_id,
            account_totals_by_date.classification,
            account_totals_by_date.account_path,
            account_totals_by_date.account_name,
            account_totals_by_date.account_type,
            account_totals_by_date.level,
            account_totals_by_date.parent_account_id,
            account_totals_by_date.org_id,
            account_totals_by_date.value_date,
            account_totals_by_date.debit_amount,
            account_totals_by_date.credit_amount,
            account_totals_by_date.net_balance,
            sum(account_totals_by_date.net_balance) OVER (PARTITION BY account_totals_by_date.account_id ORDER BY account_totals_by_date.value_date ROWS UNBOUNDED PRECEDING) AS running_balance
           FROM account_totals_by_date
        ), rolled_up_balances_by_date AS (
         SELECT abd.account_id,
            abd.classification,
            abd.account_path,
            abd.account_name,
            abd.account_type,
            abd.level,
            abd.parent_account_id,
            abd.org_id,
            abd.value_date,
            abd.debit_amount,
            abd.credit_amount,
            abd.net_balance,
            abd.running_balance,
            COALESCE(child_rollup.child_balance, 0::numeric) AS child_balance,
            abd.running_balance + COALESCE(child_rollup.child_balance, 0::numeric) AS total_running_balance
           FROM account_balances_with_running abd
             LEFT JOIN ( SELECT parent.parent_account_id,
                    parent.value_date,
                    sum(child.running_balance) AS child_balance
                   FROM account_balances_with_running parent
                     JOIN account_balances_with_running child ON child.parent_account_id = parent.account_id::text AND child.value_date <= parent.value_date
                  GROUP BY parent.parent_account_id, parent.value_date) child_rollup ON child_rollup.parent_account_id = abd.account_id::text AND child_rollup.value_date = abd.value_date
        )
 SELECT account_id,
    classification,
    account_path,
    account_name,
    account_type,
    level,
    parent_account_id,
    org_id,
    value_date,
    debit_amount,
    credit_amount,
    net_balance,
    running_balance,
    child_balance,
    total_running_balance
   FROM rolled_up_balances_by_date
  ORDER BY account_name, value_date;


-- public.v_posting_legs source
-- Flattens each double-entry posting into individual account DR/CR rows.
-- Used by v_account_monthly and getMonthlyTrialBalance in perfin.ts.

CREATE OR REPLACE VIEW public.v_posting_legs AS
  SELECT
    org_id, legal_entity_id, posting_type,
    posting_date, value_date,
    account_id        AS account_id,
    amount            AS debit_amount,
    0::numeric        AS credit_amount
  FROM posting
  WHERE account_id IS NOT NULL
    AND COALESCE(status, 'ACTIVE') NOT IN ('REVERSED', 'DUPLICATE')
    AND reversal_of_posting_id IS NULL
    AND COALESCE(posting_type, '') <> 'DUPLICATE'
  UNION ALL
  SELECT
    org_id, legal_entity_id, posting_type,
    posting_date, value_date,
    credit_account_id AS account_id,
    0::numeric        AS debit_amount,
    amount            AS credit_amount
  FROM posting
  WHERE credit_account_id IS NOT NULL
    AND COALESCE(status, 'ACTIVE') NOT IN ('REVERSED', 'DUPLICATE')
    AND reversal_of_posting_id IS NULL
    AND COALESCE(posting_type, '') <> 'DUPLICATE';


-- public.v_account_monthly source
-- Monthly aggregation of non-OPENING_BALANCE activity per account.
-- Drives the monthly trial balance report.

CREATE OR REPLACE VIEW public.v_account_monthly AS
  SELECT
    org_id,
    legal_entity_id,
    account_id,
    DATE_TRUNC('month', value_date)::date AS period_month,
    SUM(debit_amount)  AS period_debits,
    SUM(credit_amount) AS period_credits
  FROM v_posting_legs
  WHERE posting_type IS DISTINCT FROM 'OPENING_BALANCE'
  GROUP BY org_id, legal_entity_id, account_id, DATE_TRUNC('month', value_date);


   -- public.posting_account_view source

CREATE OR REPLACE VIEW public.posting_account_view
AS SELECT p.id,
    p.account_id,
    p.account_name,
    p.value_date,
    p.posting_date,
    p.amount,
    p.posting_type,
    p.notes,
    p.created_by,
    p.created_at,
    p.modified_by,
    p.modified_at,
    p.org_id,
    p.name,
    p.assigned_to,
    a.sub_type
   FROM posting p
     LEFT JOIN account a ON p.account_id = a.id::text
  WHERE COALESCE(p.status, 'ACTIVE') NOT IN ('REVERSED', 'DUPLICATE')
    AND p.reversal_of_posting_id IS NULL
    AND COALESCE(p.posting_type, '') <> 'DUPLICATE';
