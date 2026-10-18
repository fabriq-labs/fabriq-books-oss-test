/**
 * Domain screens. App.tsx renders this fragment and does not name product pages.
 * A todo app replaces the routes in this file.
 */
import { Route } from 'react-router-dom';
import AccountList from '@/domain/gl/AccountList';
import Transactions from '@/domain/gl/Transactions';
import { AccountForm } from '@/domain/gl/AccountForm';
import { PostingForm } from '@/domain/gl/PostingForm';

export function DomainRoutes() {
  return (
    <>
      <Route path="accounting/accounts" element={<AccountList />} />
      <Route path="accounting/transactions" element={<Transactions />} />
      <Route path="account/:id/view/:viewId" element={<AccountForm />} />
      <Route path="account/view/:viewId" element={<AccountForm />} />
      <Route path="posting/:id/view/:viewId" element={<PostingForm />} />
      <Route path="posting/view/:viewId" element={<PostingForm />} />
    </>
  );
}
