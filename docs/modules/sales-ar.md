# Sales and receivables

Sales in Books is a subledger: parties, a catalog, tax, and three documents — invoices, payment receipts, and credit notes — plus the applications that say which document settled which. The shape is Books’ own. A connection from an external bookkeeping system fills the same tables, and the lists do not care which path created the row. QuickBooks Online is the connector that ships; the field names on these screens are the ones in the table below, not a vendor’s API names.

The words are defined in [Concepts](../concepts.md). This page is how they show up when you are keeping the books.

The screens depend on `seed:sales` and `seed:ar-settlement`. [Getting started](../getting-started.md) has the commands.

## Customers, suppliers, and items

**Sales → Customers.** The form stores the name you invoice under, an optional legal name, email, phone, postal address, website, currency, and entity, and whether the customer is active. A customer imported from a connection is the same kind of row. The list shows a source column when the row remembers which connection it came from, so you can tell a keyed-in customer from an imported one.

**Purchases → Suppliers.** A supplier is the vendor. The form is the vendor’s name and contact details. Items can name a preferred supplier. A connection that sends vendors lands them here.

**Sales → Items.** An item has a name, a code, a description, a type (`service`, `inventory`, or `non_inventory`), a unit price, a sales account, a purchase account, an optional tax group, and a stockable flag. Invoice lines point at items. The item is the catalog entry; quantity on hand is not a balance this screen maintains.

## Tax

Tax is under its own sidebar group, because a rate and a group are masters you reuse across invoices.

A **tax rate** is one component: code, name, rate, component type, whether it is recoverable, and whether it is active. A **tax group** is the code an invoice line uses, made of one or more rates. A **tax region** is a place, such as a state. `seed:sales` inserts several US states so the region list is usable before any import. An entity can store a default tax region on the entity record.

An invoice keeps three header amounts — net, tax, and total — as decimals. A line can point at a tax group. Books stores those amounts; it does not recalculate them from a tax engine when you open the screen.

## Invoices

Sales → Invoices is the list of sales documents: number, dates, customer, status, and amounts, including the open **balance**. Open a row to see the header and the lines. Each line has a number, an item, a description, a quantity, a unit price, and an amount. The header adds the due date, currency, entity, reference, bill-to and ship-to text, and notes when those were stored.

Direction on these invoices is `sales`. Status is `draft`, `posted`, or `void`. The balance is the amount still open, stored on the invoice so the list can show it. Applications, below, are what move that balance when a receipt or a credit is applied.

Draft invoices created in Books use a document layout aligned with the prod sales invoice: one card, two-pane header with compact labels, an item table, and a **stacked totals footer** (subtotal → tax → shipping → adjustment → grand total → balance). Line and header fields persist on blur; the server recalculates amounts and returns the full parent graph. Imported connection invoices stay read-only.

The invoice screen reads a document that is already stored. Customers, items, and tax are the records you maintain in their own forms; the invoice is the document those records hang from, whether you loaded it through the API or a connection imported it.

## Payment receipts

Sales → Payments received lists cash received from customers. A row shows the number, date, status, customer, amount, unapplied amount, method, reference, currency, and the deposit-to account.

The **amount** is the cash (or the zero, in the credit-application case below). It stays fixed. How that amount was used is a set of **applications**, not extra columns on the receipt. **Unapplied** is the part of the amount that is not on an application yet. The import pipeline keeps this identity:

```text
receipt amount = sum of application amounts + unapplied amount
```

A receipt can also store a single invoice id when exactly one application targets an invoice. That pointer is a convenience for finding the invoice. The sum above is the one that has to hold.

The deposit-to account is where the cash is recorded on the receipt (a bank account or undeposited funds). The entity’s default undeposited-funds account, on the entity form, is the account you record for that purpose. The receipt still stores its own deposit account.

## Applications and the open balance

An application is a row that says “this much of this receipt settled this document,” or “this much of this credit note settled this invoice.”

On a payment receipt the amount is **signed**.

- A positive amount targets an invoice. It pays the invoice down.
- A negative amount targets a credit note. It uses up credit the customer already holds.

The sign is what makes one receipt able to collect cash and use a credit at the same time. A receipt can also have an amount of zero and still settle an invoice, by carrying two applications that cancel: a positive amount on the invoice and a negative amount on the credit note. The cash is zero; the credit is what clears the invoice. That pattern is a normal settlement, not a special case of one vendor.

A second table records a **direct** application from a credit note to an invoice. The amount there is positive: this much of the credit was applied to this invoice, with no receipt in between. Books keeps both shapes because bookkeeping systems disagree about whether a credit is applied by itself or only by attaching it to a payment. The QuickBooks connector writes the signed receipt applications, including the zero-receipt pattern, and does not write the direct table. Another connection, or a row written through the API, can use the direct application.

For an invoice the connector maintains, the stored balance is the invoice total minus the receipt applications that target it and minus any direct credit applications. A fully paid invoice shows a balance of zero. A receipt that only partly applies shows the remainder as unapplied, and the invoice balance stays above zero by the unpaid part.

Worked numeric examples of the same identities are in the maintainer note [AR settlement and ledger](../domain/AR_SETTLEMENT_AND_LEDGER.md).

## Credit notes

Sales → Credit notes lists the documents that reduce what a customer owes. A row shows the number, date, status, customer, net, tax, total, balance, currency, and source. Lines under the credit note mirror invoice lines: item, description, quantity, price, and amount.

A credit note may point at an invoice. That link is the invoice the credit was raised against (the origin). It is not, by itself, the settlement. Settlement is an application: either a negative application on a payment receipt, or a direct credit-note application onto an invoice.

Status follows the invoice set: `draft`, `posted`, or `void`. A voided receipt has its applications removed on the next sync that sees the void, so a voided payment does not keep reducing invoice balances.

## What a repeated import does

Each imported header remembers the connection and the external record id. A later import updates that row. It does not insert a second customer or a second invoice for the same external id.

Applications sometimes arrive before the invoice or credit note they name. The sync links them once the document is present. If a source line disappears, the matching application or credit-note line is removed for documents included in that run. The payments list and the credit notes list are where you re-read the result: amounts, unapplied, balance, and status.

Customers, suppliers, items, accounts, and tax codes from the same run show up in their own lists. The connection screen that starts the run is [Connections](./connections.md).

## The subledger and the reports

Invoice balances, receipt amounts, and credit balances live on those documents. Financial reports read postings. Entering or importing an invoice updates the sales list; the trial balance changes when a posting exists for the period. The ledger defaults on the entity are the accounts recorded for that entity, edited from Accounting → Entities and described in [Ledger](./ledger.md).
