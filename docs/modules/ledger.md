# Ledger

The ledger is the chart of accounts, the journal, and the reports. In the sidebar it is the Accounting group and the Reports group. Every amount those reports show comes from a posting, for an entity, in a period. Sales documents have their own balances; those balances are described in [Sales and receivables](./sales-ar.md). This page is the general ledger as Books keeps it today.

If the Accounting group is missing, the view seeds have not been applied. [Getting started](../getting-started.md) lists `seed:gl` and `seed:entities`.

## Entities

An entity is a company inside your organization. Accounting → Entities opens the list. The form stores the name, legal name, address, currency, and a headquarters checkbox. Mark the entity that represents the group. Books expects one headquarters entity per organization. The database enforces that with a partial unique index you apply separately, because the schema tool cannot emit it. The statement is in [Database](../operations/database.md).

The same form has a **Ledger defaults** section:

| Field | What you are recording |
|---|---|
| Default AR account | The receivable account for this entity. |
| Default income account | The income account for this entity. |
| Default undeposited funds | The account cash sits in before it is deposited. |
| Default FX gain/loss | The account for exchange differences. |
| Default discount account | The account for discounts. |
| Ledger start date | A cutover date stored on the entity. |

Each account field is a dropdown of accounts already on the chart. Saving writes those ids onto the entity. That is the whole behavior of the section: the entity remembers the accounts. A helper can fill blanks from a chart that was imported or seeded:

```bash
cd backend && npm run ledger:prefill-entity-defaults -- --org org_kernel
```

Add `--entity <id>` to limit it to one entity. The command skips defaults that already have a value, and it does not write postings.

The entity control in the top bar filters Accounting → Transactions to the selected entity. Choose “All Entities” when you want the unfiltered list. Reports have their own entity picker and can include several entities at once.

## Chart of accounts

Accounting → Chart of Accounts is the account list: code, name, classification, account number, the stored balance, and whether the account is active. Classification is `asset`, `liability`, `equity`, `income`, or `expense`. Open an account to edit it, or create one.

The stored balance on the account is a column on that row. Reports ignore it and sum postings, so a report can disagree with the balance column until something updates that column. Trust the report.

A starter chart is `npm run seed:coa -- us-ca` (USD) or `npm run seed:coa -- india` (INR), from `backend/`. Both arguments load the same account codes; the argument chooses the currency written on the rows. Running the command again with the other currency updates those codes in place. Accounts that arrive through a connection appear in this same list.

An account can be limited to one entity. Exchange rates, below, are what a multi-entity report uses when those currencies differ.

## Postings

A posting is one balanced pair: a debit account, a credit account, and one amount. Accounting → Transactions is the list. The form also stores a name, a description, a value date (when it counts in the books), a posting date (the statement date), a kind, a status, and an entity.

Kinds the form offers are `opening`, `journal`, `reversal`, `sales_invoice`, `closing`, and `duplicate`. Status is `active` or `reversed`. The list hides `duplicate` rows by default so a repeated import does not double the screen. A new journal you type in is kind `journal` unless you change it.

The transactions screen can import a CSV. Map the file’s debit amount, credit amount, and counter account; the importer turns each line into one posting amount and two account ids before it saves. Use this for a statement-style file. For a starting trial balance, prefer Opening Balances, which checks that the entry balances.

## Opening balances

Accounting → Opening Balances lists balance-sheet accounts (asset, liability, equity). Pick the entity and the as-of date, type a debit or a credit on each account that has an opening position, and save. In each account currency the debits must equal the credits, and at least one amount must be non-zero. The save creates postings of kind `opening`.

## Exchange rates

Accounting → Exchange Rates stores a rate from one currency to another on an effective date, with a type of `spot`, `closing`, or `average`. Reports convert an account’s currency into the reporting currency with these rows. When no rate fits, the cell reads `rate_missing` rather than showing a converted number you might take as final.

The demo seed `npm run seed:books-demo` inserts INR-to-USD average and closing rates and a year of journals, so a 2026 income statement has something to show. The figures are listed in [Getting started](../getting-started.md).

## Reports

Each report asks for a financial year (January–December by default), an optional month inside that year, a reporting currency, and one or more entities. “Show only activity” hides accounts with nothing in the period. You can also focus on a single account.

| Report | What it shows |
|---|---|
| Trial balance | Opening debit and credit, and the period’s debit and credit, per account, plus a rate column. |
| Income statement | Income and expense accounts and the amount for the period. |
| Balance sheet | Assets, liabilities, and equity. |
| Cash flow | Opening cash, net change, closing cash, and the activity rows behind the change. |
| Posting list | The postings that fell in the period, which is the detail behind the other four. |

The reporting currency is whichever currency you select. On the seeded tenant the organization’s base currency is US dollars. A report that includes the Indian entity needs the INR rate or those rows stay marked `rate_missing`.
