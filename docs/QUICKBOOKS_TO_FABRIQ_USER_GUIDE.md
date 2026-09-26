# QuickBooks Online → Fabriq User Guide

**Who this is for:** business users, operations, finance — anyone who uses Fabriq and needs to know what arrives from QuickBooks and how fields match.  
**Not for:** engineers setting up Airbyte/DBT (see [QUICKBOOKS_FORWARD_SYNC.md](./QUICKBOOKS_FORWARD_SYNC.md)).  
**Last updated:** 2026-09-23

---

## In plain English

When you connect **QuickBooks Online** and run **Sync**, Fabriq copies selected records from QuickBooks into your Fabriq company.

- Changes in QuickBooks update matching Fabriq records on the next sync.
- This guide is **one direction only**: QuickBooks → Fabriq. Fabriq does **not** write these records back to QuickBooks.

```
QuickBooks Online  →  Sync  →  Fabriq screens
```

---

## 1. What records come from QuickBooks?


| #   | In QuickBooks                          | In Fabriq (menu)                         | What it is                                |
| --- | -------------------------------------- | ---------------------------------------- | ----------------------------------------- |
| 1   | **Customers**                          | **Sales → Customers**                    | People/companies you sell to              |
| 2   | **Vendors**                            | **Purchases → Suppliers**                | People/companies you buy from             |
| 3   | **Products & Services (Items)**        | **Masters → Item Master**                | Products and services you sell or buy     |
| 4   | **Chart of Accounts**                  | **Accounting → Chart of Accounts**       | GL accounts (income, expense, bank, etc.) |
| 5   | **Invoices** (sales)                   | **Sales → Invoices**                     | Sales invoices and line items             |
| 6   | **Billing address on invoices**        | **Masters → Locations**                  | Bill-to locations from invoice addresses  |
| 7   | **Sales Tax Rates / Codes / Agencies** | **Accounting → Tax Master / Tax Groups** | Tax rates and combined tax codes          |


Only **active** customers, vendors, items, accounts, and tax rates are brought in. Inactive ones are skipped.

---

## 2. Field matching (QuickBooks → Fabriq)

Left = QuickBooks · Right = Fabriq.

---

### 2.1 Customers

**Where:** Sales → Customers


| QuickBooks             | Fabriq                       | Notes                          |
| ---------------------- | ---------------------------- | ------------------------------ |
| Customer display name  | Customer name                | If empty, company name is used |
| Company name           | (fallback for customer name) |                                |
| Email                  | Primary email                |                                |
| Phone number           | Primary phone                |                                |
| Website                | Website                      |                                |
| Billing street 1 (+ 2) | Customer address             | Combined when both present     |
| Billing city           | City                         |                                |
| Billing state          | State                        |                                |
| Billing country        | Country                      |                                |
| Billing ZIP            | ZIP code                     |                                |
| Terms                  | Payment term                 | Matched by name                |
| Currency               | Preferred currency           | Matched by currency code       |
| Taxable / Tax exempt   | Tax treatment                | **Taxable** or **Tax exempt**  |
| —                      | Industry                     | Always **Not Specified**       |


**Not stored in Fabriq:** title / first / middle / last name, mobile, fax, shipping address on the customer (shipping is used on invoices → Deliver to / Locations), notes, attachments, payment method, customer type, resale number, opening balance, custom fields.

---

### 2.2 Vendors → Suppliers

**Where:** Purchases → Suppliers


| QuickBooks             | Fabriq                    | Notes                               |
| ---------------------- | ------------------------- | ----------------------------------- |
| Vendor display name    | Supplier name             | If empty, company name is used      |
| Company name           | Legal name                | Falls back to display name if empty |
| Print on check as      | Name                      |                                     |
| Email                  | Primary email             |                                     |
| Phone number           | Primary phone             |                                     |
| Mobile number          | Alternative phone         |                                     |
| Website                | Website                   |                                     |
| Street address 1 (+ 2) | Supplier address          | Combined when both present          |
| City                   | City                      |                                     |
| State                  | State                     |                                     |
| Country                | Country                   |                                     |
| ZIP code               | ZIP code                  |                                     |
| Tax ID                 | Legal registration number |                                     |
| Terms                  | Payment term              | Matched by name                     |
| Currency               | Preferred currency        | Matched by currency code            |
| Active / Inactive      | Status                    | **Active** or **Inactive**          |
| —                      | Industry                  | **Not Specified**                   |
| —                      | Business classification   | **Not Specified**                   |


**Not stored:** first/middle/last name, fax, notes, attachments, 1099 tracking, default expense account, opening balance.

---

### 2.3 Products & Services → Item Master

**Where:** Masters → Item Master


| QuickBooks             | Fabriq                        | Notes                                                          |
| ---------------------- | ----------------------------- | -------------------------------------------------------------- |
| Name                   | Item name                     | Also stored as Name                                            |
| Item type              | Item type                     | Defaults to **Service** if missing                             |
| SKU                    | Item code                     | Max 20 characters                                              |
| Description (sales)    | Item description              | If empty, name is used                                         |
| Price / rate           | Unit price                    | Defaults to **0** if missing                                   |
| Income account         | Sales account                 | After Chart of Accounts sync                                   |
| Sales tax category     | Item tax category             | Label from QuickBooks                                          |
| Preferred vendor       | Preferred supplier / Supplier | After Vendors sync                                             |
| Expense account        | Purchase account              | After Chart of Accounts sync                                   |
| Track quantity on hand | Stockable                     | **Y** only for inventory items that track qty; otherwise **N** |
| Active / Inactive      | Item status                   | **active** or **inactive**                                     |


**Not stored:** purchase cost, purchase description, category, image.

---

### 2.4 Chart of Accounts

**Where:** Accounting → Chart of Accounts


| QuickBooks       | Fabriq         | Notes                           |
| ---------------- | -------------- | ------------------------------- |
| Account name     | Name           |                                 |
| Account type     | Type           | e.g. Expense, Income, Bank      |
| Account sub-type | Sub type       |                                 |
| Classification   | Classification | See nested mapping below        |
| Current balance  | Balance        |                                 |
| Active           | Is active      | Yes / No                        |
| Parent account   | Parent account | **Not linked** yet (left empty) |


**Classification values (QBO → Fabriq)**


| QuickBooks | Fabriq      |
| ---------- | ----------- |
| Asset      | Assets      |
| Liability  | Liabilities |
| Revenue    | Income      |
| Expense    | Expense     |
| Equity     | Equity      |


---

### 2.5 Sales invoices

**Where:** Sales → Invoices


| QuickBooks                  | Fabriq                            | Notes                                  |
| --------------------------- | --------------------------------- | -------------------------------------- |
| Invoice number (Doc number) | Invoice number                    | If blank → **INV-** + QuickBooks id    |
| Invoice date (Txn date)     | Invoice date                      |                                        |
| Customer                    | Customer                          | Linked to synced customer              |
| Billing address             | Bill to                           | Combined into one address line         |
| Shipping address            | Deliver to                        | Falls back to billing if ship-to empty |
| Billing address             | Location                          | Also creates Masters → Locations       |
| Total amount                | Invoice total / Invoice net total | Taken from QuickBooks as-is            |
| Balance due                 | Balance amount                    |                                        |
| Tax total                   | Tax total                         | From QuickBooks tax detail             |
| Currency                    | Currency                          | Matched by code                        |
| Exchange rate               | Exchange rate                     | Defaults to **1** if missing           |
| Sales term                  | Payment terms                     | By name, or by days to due date        |
| Private note                | Notes                             |                                        |
| Balance vs total            | Invoice status                    | See nested status rules                |
| —                           | Invoice type                      | Always **SALES**                       |
| —                           | Legal entity                      | Set to company HQ entity               |


**How invoice status is decided**

Fabriq does **not** copy a status label from QuickBooks. It derives status from amounts:


| Situation in QuickBooks         | Status in Fabriq |
| ------------------------------- | ---------------- |
| Balance is **0** and total > 0  | **Paid**         |
| Balance > 0 but less than total | **Partial**      |
| Otherwise                       | **Open**         |


If you mark an invoice paid in QuickBooks (balance → 0), the next sync should show **Paid** in Fabriq.

**Invoice line items**

**Where:** Open a sales invoice → line items


| QuickBooks           | Fabriq                         | Notes                                         |
| -------------------- | ------------------------------ | --------------------------------------------- |
| Product/service name | Item name                      | Falls back to line description                |
| Description          | Item description               |                                               |
| Quantity             | Ordered quantity / Invoice qty |                                               |
| Unit price           | Rate                           |                                               |
| Amount (line)        | Line total / Invoiced amount   | Same QuickBooks amount                        |
| Tax code             | Tax type                       | e.g. TAX                                      |
| Tax % (when taxable) | Tax rate / Tax (%)             | From invoice tax percent when line is taxable |
| Product/service      | Item master link               | Linked if that item was already synced        |


Line tax amount is not populated from QuickBooks at sync.

**Related masters used by invoices**


| Invoice uses      | Synced from QuickBooks | In Fabriq               |
| ----------------- | ---------------------- | ----------------------- |
| Customer          | Customers              | Sales → Customers       |
| Product / Service | Products and services  | Masters → Item Master   |
| Tax code / rate   | Tax Rates / Tax Codes  | Tax Master / Tax Groups |


---

### 2.6 Locations (from invoice billing addresses)

**Where:** Masters → Locations

Created from the **billing address** on QuickBooks sales invoices.


| QuickBooks               | Fabriq       | Notes                                  |
| ------------------------ | ------------ | -------------------------------------- |
| Customer name            | Name         | Or city if name is missing             |
| Billing city (or street) | Location     | Prefer city → street → customer name   |
| Billing street           | Address      |                                        |
| Billing city             | City         |                                        |
| Billing state            | State        |                                        |
| Billing country          | Country      | Defaults to **United States** if empty |
| Billing ZIP              | ZIP code     |                                        |
| Full billing address     | Full address | Combined into one line                 |
| Customer                 | Customer     | Linked to synced customer              |


---

### 2.7 Sales tax (Agencies, Rates, Codes)

**Where in QuickBooks:** Sales Tax → Sales Tax Rates and Agencies  
**Where in Fabriq:** Accounting → Tax Master / Tax Groups


| QuickBooks                         | Fabriq                            | Notes                                   |
| ---------------------------------- | --------------------------------- | --------------------------------------- |
| Tax Rate Name                      | Tax Master → tax name             | Single / component rate                 |
| Tax Rate %                         | Tax Master → tax rate             | Rounded to whole number in Fabriq today |
| Agency Name                        | Tax Master → geo                  | Agency / jurisdiction label             |
| Active                             | Tax Master → status               | Active / Inactive                       |
| Combined rate name (Tax Code)      | Tax Group → name                  | e.g. Tucson Combined                    |
| Component rates on a combined code | Tax Group components → Tax Master | Linked rates that make up the total     |


There is **no** separate Tax Agency screen in Fabriq. Agency name is stored on the rate as **geo**.

**Concept: Agency vs Single rate vs Combined (component) rate**

QuickBooks has three related pieces. You need all three to understand tax on invoices.

#### 1. Tax Agency (who you pay)

Examples:


| Agency name              | Use for                    |
| ------------------------ | -------------------------- |
| Board of Equalization    | California state sales tax |
| Arizona Dept. of Revenue | Arizona state + city taxes |


Agency is only a label on the rate in Fabriq (field **geo**).

#### 2. Single tax rate → Tax Master

One agency + one %. Use when you report one rate.

**Example — California**


| Field       | Value                 |
| ----------- | --------------------- |
| This is a   | **Single tax rate**   |
| Tax name    | California            |
| Agency name | Board of Equalization |
| Rate        | **8.00%**             |


**Example — AZ State**


| Field       | Value                    |
| ----------- | ------------------------ |
| This is a   | **Single tax rate**      |
| Tax name    | AZ State tax             |
| Agency name | Arizona Dept. of Revenue |
| Rate        | **7.10%**                |


#### 3. Combined tax rate (components) → Tax Group

Use when you must report parts separately (state + city). The total is the sum of components.

**Example — Tucson Combined**


| Field     | Value                 |
| --------- | --------------------- |
| This is a | **Combined tax rate** |
| Tax name  | Tucson Combined       |



| Component name | Agency name              | Rate      |
| -------------- | ------------------------ | --------- |
| AZ State tax   | Arizona Dept. of Revenue | **7.10%** |
| Tucson City    | Arizona Dept. of Revenue | **2.00%** |


**Total tax rate:** **9.10%**

```
Agencies
  ├── Board of Equalization
  └── Arizona Dept. of Revenue

Tax Rates (→ Tax Master)
  ├── California     8.00%  → Board of Equalization
  ├── AZ State tax   7.10%  → Arizona Dept. of Revenue
  └── Tucson City    2.00%  → Arizona Dept. of Revenue

Tax Code (→ Tax Group)
  └── Tucson Combined = AZ State tax + Tucson City = 9.10%
```

#### How this shows on invoices / items


| Already on synced invoices / items | Meaning                                         |
| ---------------------------------- | ----------------------------------------------- |
| Invoice line tax code              | Points at a QBO Tax Code (TAX / NON / combined) |
| Invoice tax %                      | From invoice tax detail                         |
| Item sales tax category            | Stored as item tax category (label only)        |


**How to enter tax in QuickBooks (so it syncs cleanly)**

1. Create the **Agency** (e.g. Arizona Dept. of Revenue).
2. Create each **Single rate** with agency + % (e.g. AZ State 7.10%, Tucson City 2%).
3. Create a **Combined rate** and add those components (e.g. Tucson Combined = 9.10%).
4. On a sales invoice, choose the tax code / combined rate that applies to the customer.
5. Run **Sync** in Fabriq. Check **Tax Master** for single rates and **Tax Groups** for combined codes.

**Limits to know**


| Topic                              | Behaviour                                                                     |
| ---------------------------------- | ----------------------------------------------------------------------------- |
| Decimal rates (e.g. 7.10%)         | Fabriq `tax_rate` is a whole number today — values are **rounded** (7.10 → 7) |
| Automated Sales Tax (AST)          | Some rates/codes may be limited depending on QBO company setup                |
| Fabriq → QuickBooks tax write-back | Not supported                                                                 |


---

## 3. What changes in Fabriq after a sync?


| Screen                      | Fields that refresh from QuickBooks                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Customers**               | Customer name, address, city, state, country, ZIP, phone, email, website, payment term, preferred currency, tax treatment                        |
| **Suppliers**               | Supplier name, legal name, address, city, state, country, ZIP, phone, email, website, status                                                     |
| **Item Master**             | Item name, description, type, unit price, stockable (Y/N), item status, sales/purchase accounts, preferred supplier                              |
| **Chart of Accounts**       | Name, type, sub type, classification, balance, is active                                                                                         |
| **Sales Invoices**          | Invoice number, date, status, bill to, deliver to, totals, balance, tax total, notes, currency, exchange rate, payment terms, customer, location |
| **Invoice lines**           | Item name, description, qty, rate, amounts, tax type / tax rate                                                                                  |
| **Locations**               | Name, address fields, full address, linked customer                                                                                              |
| **Tax Master / Tax Groups** | Tax names, rates, agency (geo), combined groups and components                                                                                   |


### New vs updated


| Situation                                                        | What happens in Fabriq                                           |
| ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| New record in QuickBooks                                         | Appears as a **new** record in Fabriq                            |
| You change an existing record in QuickBooks                      | Same Fabriq record is **updated**                                |
| You inactivate a customer/vendor/item/account/rate in QuickBooks | Not refreshed on later syncs (only active records are processed) |


---

## 4. What you will *not* see synced (today)


| Topic                                                 | Current behaviour                                           |
| ----------------------------------------------------- | ----------------------------------------------------------- |
| Purchase bills / AP invoices                          | Not synced                                                  |
| Payments / receipts as separate records               | Not synced; invoice **balance** and **status** still update |
| Purchase orders, estimates, credit notes              | Not synced                                                  |
| Parent account hierarchy                              | Chart of Accounts parent link left empty                    |
| Item Category / Image                                 | Not synced                                                  |
| Purchase cost / purchase description on items         | Not stored (no matching Item Master fields)                 |
| Editing in Fabriq then expecting QuickBooks to change | This sync does **not** write back to QuickBooks             |


---

## 5. How to check after a sync

1. Open **Settings → Connections** and confirm QuickBooks shows a successful sync.
2. Spot-check one record you know in QuickBooks:


| Check this in QuickBooks                   | Open this in Fabriq                  |
| ------------------------------------------ | ------------------------------------ |
| A customer’s display name & email          | Sales → Customers                    |
| A vendor’s display name & address          | Purchases → Suppliers                |
| A product/service name & price             | Masters → Item Master                |
| An account name & balance                  | Accounting → Chart of Accounts       |
| A sales invoice number, total, and balance | Sales → Invoices                     |
| A tax rate or combined code                | Accounting → Tax Master / Tax Groups |


1. Confirm names and amounts match **section 2**.
2. If an invoice was paid in QuickBooks, confirm Fabriq shows **Paid** and balance **0**.

---

## 6. Quick reference: name changes


| QuickBooks calls it…         | Fabriq calls it…                       |
| ---------------------------- | -------------------------------------- |
| Customer                     | Customer                               |
| Vendor                       | Supplier                               |
| Product / Service (Item)     | Item Master                            |
| Account                      | Chart of Accounts (account)            |
| Invoice                      | Sales Invoice                          |
| Display name                 | Customer name / Supplier name          |
| Doc number                   | Invoice number                         |
| Balance (on invoice)         | Balance amount (+ drives status)       |
| Tax Rate (single)            | Tax Master                             |
| Combined tax rate / Tax Code | Tax Group                              |
| Tax Agency                   | geo on Tax Master (no separate screen) |


---

## Related documents


| Document                                                                            | Audience                                           |
| ----------------------------------------------------------------------------------- | -------------------------------------------------- |
| [This guide](./QUICKBOOKS_TO_FABRIQ_USER_GUIDE.md)                                  | Business / ops users — all field maps and concepts |
| [QUICKBOOKS_FORWARD_SYNC.md](./QUICKBOOKS_FORWARD_SYNC.md)                          | Engineers / PSO setup                              |
| [INTEGRATIONS.md](./INTEGRATIONS.md)                                                | Architecture overview                              |
| [QUICKBOOKS_STRATEGY.md](../backend/integrations/quickbooks/QUICKBOOKS_STRATEGY.md) | Design decisions                                   |
| [tax/TAX_ARCHITECTURE.md](./tax/TAX_ARCHITECTURE.md)                                | Fabriq tax model internals                         |


