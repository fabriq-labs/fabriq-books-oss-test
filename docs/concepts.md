# Concepts

Books uses a small set of accounting objects, and the same objects whether you type them in or a connection imports them. This page defines those objects as the application stores them today. It is not a connector manual. QuickBooks is named only where the shipped connector behaves in a way a reader of the model should expect.

The sidebar follows the same split: Accounting and Reports are the ledger, Sales and Purchases and Tax are the subledger, Integrations is the connection.

## Organization and entity

An **organization** is the tenant. Every business row is stamped with `org_id`, and a request from a signed-in user sees that user's organization. The local seed creates two organizations: `org_system`, which holds shared defaults such as views and the US dollar currency, and `org_kernel`, which is the tenant you log into as `admin@example.com`. You do not pick `org_system` as a company to keep books for.

An **entity** is a legal entity inside that tenant: a name, an optional legal name and address, a currency, and a headquarters flag. Reports and postings are sliced by entity. The control in the top bar filters the transactions list to the entity you select. One entity in the organization is the headquarters. A partial unique index, applied as SQL because Prisma does not emit it, keeps that to a single row per organization. See [Database](./operations/database.md).

Each entity also stores **ledger defaults**: the receivable account, the income account, the undeposited-funds account, the foreign-exchange gain or loss account, and the discount account, plus an optional **ledger start date**. These are editable fields on the entity form. They record which accounts belong to that entity for ledger work. Saving them does not create postings.

## Account

An **account** is a line on the chart of accounts. It has a code, a name, a classification (`asset`, `liability`, `equity`, `income`, or `expense`), optional account types and a sub-type, a currency, and an optional link to one entity. Accounts you import through a connection land in this same list, next to accounts you add by hand or load with `seed:coa`.

The balance column on the chart is a stored value on the account row. Financial reports do not trust that column. They sum **postings**.

## Posting

A **posting** is one journal line-pair: a debit account, a credit account, a single amount, a value date (the accounting date), and a posting date (the statement date). `kind` distinguishes opening balances, ordinary journals, reversals, closing entries, and a few sales-related kinds the schema already allows. `status` is `active` or `reversed`. The transactions list hides rows whose kind is `duplicate`, so a superseded import does not sit in the default view.

You enter a posting from Accounting → Transactions. The same screen can import a CSV that has separate debit and credit amount columns; the importer turns each row into one amount and two accounts before it saves. Accounting → Opening Balances writes postings of kind `opening` for balance-sheet accounts. It saves only when, in each account currency, the debits you typed equal the credits.

Reports read these postings for a period you choose. The default financial year is January through December. You can narrow to a month, choose which entities to include, and choose a reporting currency. Amounts in another currency are converted with an **exchange rate** (a from-currency, a to-currency, an effective date, and a type of `spot`, `closing`, or `average`). If the rate is missing, the report shows `rate_missing` on that row instead of inventing a number.

## Customer, supplier, and item

A **customer** is the party you invoice. The form stores the name, an optional legal name, email, phone, address, website, currency, and entity, and whether the customer is active. A **supplier** is the vendor party. The supplier list is under Purchases. Items can name a preferred supplier, and a connection imports vendors into this list.

An **item** is something you sell or buy: a name, a code, a description, a type (service, inventory, or non-inventory), a unit price, a sales account, a purchase account, an optional tax group, and a flag for whether the item is stockable. Items are the catalog invoices refer to.

## Tax

Tax is three masters, on purpose, so a rate can be reused and a group can bundle more than one rate.

A **tax rate** (`tax_master`) is one component: a code, a name, and a rate. A **tax group** bundles one or more rates through its components, which is how an invoice line can carry a combined code. A **tax region** is a place of supply, such as a state. `seed:sales` inserts a handful of US states so the region list has rows before any import. An entity can store a default tax region. An invoice stores net, tax, and total as decimals on the header, and a line can point at a tax group.

## Invoice

An **invoice** is a sales document: a number, an invoice date, a due date, a customer, an entity, a currency, a direction, a status, and amounts. Direction for this module is `sales`. Status is `draft`, `posted`, or `void`. The amounts are net, tax, total, and **balance** — the open amount still owed, stored on the invoice so the list can show it without summing child rows in the browser.

Lines sit under the invoice: a line number, an item, a description, a quantity, a unit price, and an amount. Opening an invoice from Sales → Invoices shows the header and those lines. If a connection imported the invoice, the screen also shows that it came from the source system.

The balance is reduced by applications, described next. The invoice's own `invoice_id` link on a credit note, when present, records which invoice the credit was raised against. That origin link is not the settlement.

## Payment receipt

A **payment receipt** is the cash event: money received from a customer on a date, for a fixed **amount**, deposited to an account (cash or undeposited funds). The list shows the number, date, status, customer, amount, unapplied amount, method, reference, currency, and deposit account.

The amount on the receipt does not change when you apply it. Applications are separate rows. What has not been applied is **unapplied amount**. The invariant the import pipeline keeps is:

```text
receipt amount = sum of application amounts + unapplied amount
```

A receipt may also point at a single invoice as a convenience when there is exactly one invoice application. Balance math uses the application rows, not that convenience pointer.

## Application

An **application** is how Books records that one document settled another.

A **payment receipt application** ties a receipt to a target. The target type is an invoice, a credit note, or, less often, another receipt, a journal, a refund, or something else the source system sent. `amount_applied` is **signed**. A positive amount settles an invoice (it pays down what the customer owes). A negative amount consumes a credit note (it uses up credit the customer already has). The sign is what lets one receipt both collect cash and apply a credit in the same event, which is how some bookkeeping systems represent “use this credit memo on this invoice.” The database check for the QuickBooks-shaped rows requires invoice targets to be non-negative and credit-note targets to be non-positive, once that check has been applied. See [Database](./operations/database.md).

A **credit note application** is the other shape: a direct allocation from a credit note to an invoice, with a positive `amount_applied`. The model supports it so a credit can be applied without inventing a zero-value receipt. The QuickBooks connector does not write this table. When QuickBooks applies a credit, the transform records signed lines on the payment receipt instead, and those lines show up as payment receipt applications.

On each sync, the connector resolves applications that arrived before the invoice or credit note they point at, drops application rows whose source line disappeared, and removes applications on a receipt that has been voided. Running the import again updates the same Books rows; it does not create a second customer or a second invoice for the same external id. The matching key is the organization, the connection, and the external record id.

Invoice open balance is the stored `balance_amount`. For a document the connector maintains, that balance is the total minus the receipt applications and direct credit applications that target the invoice. Design examples with numeric walkthroughs are in [AR settlement and ledger](./domain/AR_SETTLEMENT_AND_LEDGER.md), which is a maintainer note, not required reading to use the lists.

## Credit note

A **credit note** is the document that reduces what a customer owes: a number, a date, a customer, net, tax, total, and balance, plus lines (item, description, quantity, price, amount). Status follows the same draft / posted / void set as an invoice. The optional invoice link is the origin invoice, the one being credited, and is separate from any application that later uses the credit.

The credit notes list shows those header amounts and the source, when the row was imported. Lines and the applications that consume the credit are part of the stored document. The QuickBooks transform fills them from the connected company's credit memos and from the payment lines that apply those credits.

## Connection

A **connection** is a named link between this organization and an external bookkeeping system. It can be tied to one Books entity. The connection stores whether it is active, when it last ran, and whether that run succeeded. The credentials used to reach the outside system, and the settings used to pull data, are stored encrypted and are not columns on the connections list. That split is deliberate: the list is a normal metadata view, and a view returns every field it names.

A run copies external records into the customers, suppliers, items, accounts, tax, invoices, payment receipts, and credit notes described above. You then read them in those Books screens. Three ways to run are on the connection:

- **Import now** pulls the latest data from the connected system and updates Books.
- **Reprocess existing import** updates Books from data that was already pulled, and does not contact the outside system again.
- **Pull data only** fetches new data and leaves Books records unchanged until a later reprocess. It is under More options.

The day-to-day path is [Connections](./modules/connections.md). Creating the Intuit application and the Airbyte pipeline that the QuickBooks connector requires is [Connections setup](./operations/connections-setup.md).
