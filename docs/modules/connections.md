# Connections

A connection is how Books brings in customers, vendors, items, accounts, tax, invoices, payments, and credit notes that already live in another bookkeeping system. After the import, you read those records in the ordinary Books screens. You do not keep a second set of books for the imported company.

This page is the day-to-day story: create the connection, run an import, and see the rows. The one-time work of creating a developer application and an extraction pipeline is [Connections setup](../operations/connections-setup.md). Do that first if Import now tells you the import settings are missing. The vocabulary for invoices, receipts, and applications is in [Sales and receivables](./sales-ar.md).

The list itself appears after `npm run seed:connections`, from `backend/`. The command registers the view and leaves credentials out of it. A view returns every field it includes, so secrets are simply not fields on this view. Flags such as “credentials are stored” are loaded by a separate request that returns yes or no, not the secret.

## The list

Integrations → Connections opens the list: name, system, whether the connection is active, the Books entity it is linked to, and the default purchase account if one has been chosen. Open a row for status and for the import actions. The health line on that page is one of: not imported yet, import running, healthy, needs attention, or paused. A paused connection is one that has been marked inactive. The import button stays disabled until it is active again.

## Connect a system

The connector you can create in the app today is QuickBooks Online. Choose **New**, or use the list’s create action, which opens the same form.

Give the connection a name and, if you want imported rows associated with one company in Books, pick that entity. Then enter the credentials an administrator prepared for the QuickBooks company:

- client id and client secret, from the Intuit application
- refresh token, from a completed authorization of that application
- company id (QuickBooks calls this the realm id)
- sandbox or production, matching the company you authorized

**Test connection** checks those values with QuickBooks before a new connection is saved. A failed test does not save. After a successful test, save. The detail page then shows the connection as connected, with the company id and the environment. The secret values are not shown back in full. To replace them, edit the connection and enter the full set again.

How those four values are created is the first half of [Connections setup](../operations/connections-setup.md). Once they are on the connection, you do not need the Intuit console for a normal import.

## Run an import

The detail page is titled **Import from QuickBooks**. It brings customers, vendors, items, accounts, and invoices into Books, and, when the extraction pipeline includes them, payments and credit notes as well. Which of those objects are actually fetched is decided in the extraction pipeline, not by a checklist on this page. Setup lists the streams.

Three run modes are on the page:

**Import now** asks the pipeline for the latest data, then updates Books. This is the run you want after the books have changed in the other system.

**Reprocess existing import** updates Books from data that was already pulled. It does not contact QuickBooks again. Use it when the raw import is already sitting in the database and you want Books refreshed, or when you are checking a transform without waiting on a new extract.

**Pull data only** is under More options. It fetches from QuickBooks and does not update Books records yet. A later reprocess is what folds that pull into the lists.

Import now and Pull data only stay disabled until import settings are saved. Those settings are the id of the extraction connection and the API client that can start it. They are entered on this same page, under **Set up data import**, but they come from the Airbyte workspace an administrator owns. The field labels, and what to paste, are in the setup guide. Saved values stay hidden; replacing them means typing all three again. Reprocess does not need those settings, because nothing new is pulled.

The first time you run an import, also open the avatar menu → **My Profile** → **Generate new API key**. Books uses the stored key to authorize the import service that runs beside the API. You do not paste the key into the connection form. Copy it down if you want it for your own scripts; the import path reads the stored value. Generating a key again replaces the previous one.

Start the run and refresh the page. A healthy result means the last import finished. Needs attention opens a short error from the last run. Imports often take a few minutes; the button shows “Import running” while one is in progress.

## Where the imported rows appear

When the run finishes, use the same sidebar you use for anything else:

| Books screen | What the import fills |
|---|---|
| Accounting → Chart of Accounts | Accounts from the connected company. |
| Sales → Customers | Customers. |
| Purchases → Suppliers | Vendors. |
| Sales → Items | Items. |
| Tax → Tax rates and Tax groups | Tax rates and tax codes. |
| Sales → Invoices | Invoices and their lines. Open an invoice to read the lines. |
| Sales → Payments received | Payment receipts, including amount and unapplied amount. |
| Sales → Credit notes | Credit notes and their amounts. |

A row that came from the connection keeps the connection id in its source column. Rows you created yourself in Books stay in the same lists without that source.

## Running it again

A second import updates the rows it already created. Matching is by the organization, the connection, and the external id, so the same QuickBooks customer does not become two Books customers.

Applications are allowed to arrive before the invoice or credit note they refer to. The end of the run links them once the document exists. If a payment line or a credit-note line was removed in the source, the matching row in Books is removed for documents that were part of that run. A receipt marked void loses its applications, so it stops reducing invoice balances. The lists in the table above are the place to confirm the new amounts, the unapplied remainder, and the open balance.

Reprocess is the run that does this refresh without pulling again. Import now pulls and then does the same refresh.

## Optional purchase account

The detail page can store a default purchase account. **Choose account** loads Accounts Payable accounts from the connected QuickBooks company, and the one you pick is saved on the connection. Importing customers and invoices does not use this value. Leave it unset if you are only importing.
