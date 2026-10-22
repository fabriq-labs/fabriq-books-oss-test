/**
 * Domain screens. App.tsx renders this fragment and does not name product pages.
 * A todo app replaces the routes in this file.
 */
import { Route } from 'react-router-dom';
import Master from '@/pages/Master';
import AccountList from '@/domain/gl/AccountList';
import Transactions from '@/domain/gl/Transactions';
import { AccountForm } from '@/domain/gl/AccountForm';
import { PostingForm } from '@/domain/gl/PostingForm';
import { EntityForm } from '@/domain/gl/EntityForm';
import { ExchangeRateForm } from '@/domain/gl/ExchangeRateForm';
import OpeningBalances from '@/domain/gl/OpeningBalances';
import TrialBalance from '@/domain/gl/reports/TrialBalance';
import IncomeStatement from '@/domain/gl/reports/IncomeStatement';
import BalanceSheet from '@/domain/gl/reports/BalanceSheet';
import CashFlow from '@/domain/gl/reports/CashFlow';
import PostingList from '@/domain/gl/reports/PostingList';
import ConnectionsPage from '@/domain/connections/ConnectionsPage';
import ConnectionDetailPage from '@/domain/connections/ConnectionDetailPage';
import ConnectionFormPage from '@/domain/connections/ConnectionFormPage';
import InvoiceList from '@/domain/sales/InvoiceList';
import PaymentReceiptList from '@/domain/sales/PaymentReceiptList';
import CreditNoteList from '@/domain/sales/CreditNoteList';
import CustomerList from '@/domain/sales/CustomerList';
import { InvoiceForm } from '@/domain/sales/InvoiceForm';
import { CustomerForm } from '@/domain/sales/CustomerForm';
import { ItemForm } from '@/domain/sales/ItemForm';
import { SupplierForm } from '@/domain/sales/SupplierForm';
import { TaxMasterForm } from '@/domain/sales/TaxMasterForm';
import { TaxRegionForm } from '@/domain/sales/TaxRegionForm';
import { TaxGroupForm } from '@/domain/sales/TaxGroupForm';
import OnboardingPage from '@/domain/onboarding/OnboardingPage';
import { OnboardingGate } from '@/domain/onboarding/OnboardingGate';

/** Wraps the authenticated layout; may redirect to a route in `DomainStandaloneRoutes`. */
export const DomainShellGate = OnboardingGate;

/** Authenticated routes rendered outside `AppLayout` (no sidebar or top bar). */
export function DomainStandaloneRoutes() {
  return (
    <>
      <Route path="/onboarding" element={<OnboardingPage />} />
    </>
  );
}

export function DomainRoutes() {
  return (
    <>
      <Route path="settings/connections" element={<ConnectionsPage />} />
      <Route path="settings/connections/new" element={<ConnectionFormPage />} />
      <Route path="settings/connections/:id/edit" element={<ConnectionFormPage />} />
      <Route path="settings/connections/:id" element={<ConnectionDetailPage />} />
      <Route path="source_system/view/:viewId" element={<ConnectionFormPage />} />
      <Route path="source_system/:id/view/:viewId" element={<ConnectionDetailPage />} />
      <Route path="source_system/:id/edit" element={<ConnectionFormPage />} />
      <Route path="sales/invoices" element={<InvoiceList />} />
      <Route path="sales/payments" element={<PaymentReceiptList />} />
      <Route path="sales/credit-notes" element={<CreditNoteList />} />
      <Route path="sales/customers" element={<CustomerList />} />
      <Route path="masters/items" element={<Master type="item_master" view="item_master_view" displayName="Items" />} />
      <Route path="purchases/suppliers" element={<Master type="supplier" view="supplier_view" displayName="Suppliers" />} />
      <Route path="masters/tax-rates" element={<Master type="tax_master" view="tax_master_view" displayName="Tax rates" />} />
      <Route path="masters/tax-groups" element={<Master type="tax_group" view="tax_group_view" displayName="Tax groups" />} />
      <Route path="masters/tax-regions" element={<Master type="tax_region" view="tax_region_view" displayName="Tax regions" />} />
      <Route path="invoice/:id/view/:viewId" element={<InvoiceForm />} />
      <Route path="invoice/view/:viewId" element={<InvoiceForm />} />
      <Route path="customer/:id/view/:viewId" element={<CustomerForm />} />
      <Route path="customer/view/:viewId" element={<CustomerForm />} />
      <Route path="item_master/:id/view/:viewId" element={<ItemForm />} />
      <Route path="item_master/view/:viewId" element={<ItemForm />} />
      <Route path="supplier/:id/view/:viewId" element={<SupplierForm />} />
      <Route path="supplier/view/:viewId" element={<SupplierForm />} />
      <Route path="tax_master/:id/view/:viewId" element={<TaxMasterForm />} />
      <Route path="tax_master/view/:viewId" element={<TaxMasterForm />} />
      <Route path="tax_group/:id/view/:viewId" element={<TaxGroupForm />} />
      <Route path="tax_group/view/:viewId" element={<TaxGroupForm />} />
      <Route path="tax_region/:id/view/:viewId" element={<TaxRegionForm />} />
      <Route path="tax_region/view/:viewId" element={<TaxRegionForm />} />
      <Route path="accounting/accounts" element={<AccountList />} />
      <Route path="accounting/transactions" element={<Transactions />} />
      <Route path="accounting/opening-balances" element={<OpeningBalances />} />
      <Route path="accounting/exchange-rates" element={<Master type="exchange_rate" view="exchange_rate_view" displayName="Exchange Rates" />} />
      <Route path="masters/entity" element={<Master type="entity" view="entity_view" displayName="Entities" />} />
      <Route path="account/:id/view/:viewId" element={<AccountForm />} />
      <Route path="account/view/:viewId" element={<AccountForm />} />
      <Route path="posting/:id/view/:viewId" element={<PostingForm />} />
      <Route path="posting/view/:viewId" element={<PostingForm />} />
      <Route path="entity/:id/view/:viewId" element={<EntityForm />} />
      <Route path="entity/view/:viewId" element={<EntityForm />} />
      <Route path="exchange_rate/:id/view/:viewId" element={<ExchangeRateForm />} />
      <Route path="exchange_rate/view/:viewId" element={<ExchangeRateForm />} />
      <Route path="reports/trial-balance" element={<TrialBalance />} />
      <Route path="reports/income-statement" element={<IncomeStatement />} />
      <Route path="reports/balance-sheet" element={<BalanceSheet />} />
      <Route path="reports/cash-flow" element={<CashFlow />} />
      <Route path="reports/posting-list" element={<PostingList />} />
    </>
  );
}
