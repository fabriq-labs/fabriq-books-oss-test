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

export function DomainRoutes() {
  return (
    <>
      <Route path="settings/connections" element={<ConnectionsPage />} />
      <Route path="settings/connections/new" element={<ConnectionFormPage />} />
      <Route path="settings/connections/:id/edit" element={<ConnectionFormPage />} />
      <Route path="settings/connections/:id" element={<ConnectionDetailPage />} />
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
