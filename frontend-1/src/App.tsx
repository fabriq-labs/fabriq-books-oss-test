import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ConfigProvider } from 'antd';
import { ChatProvider } from "./contexts/ChatContext";
import { AppLayout } from "./components/layout/AppLayout";
import UnifiedDashboard from "./components/dashboard/UnifiedDashboard";
import PurchaseRequisition from "./pages/PurchaseRequisition";
import { PurchaseOrder } from "./pages/PurchaseOrder";
import { Invoice } from "./pages/Invoice"; import Reports from "./pages/Reports";
import NotFound from "./pages/NotFound";
import SignInPage from "./pages/sign-in";
import PurchaseRequisitionDetailsPage from "./pages/PurchaseRequisitionDetail";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import PurchaseRequisitionDashboardPage from "./pages/PurchaseRequisition/PurchaseRequisitionDashboard";
import Master from "./pages/Master";
import PurchaseOrderDetailsPage from "./pages/PurchaseOrderDetails";
import InvoiceDetailsPage from "./components/forms/invoice/InvoiceDetails";
import { SupplierForm } from "./components/forms/Masters/SupplierForm";
import { OrganizationForm } from "./components/forms/Masters/OrganizationForm";
import { LocationForm } from "./components/forms/Masters/LocationForm";
import { BusinessUnitForm } from "./components/forms/Masters/BusinessUnitForm";
import { DepartmentForm } from "./components/forms/Masters/DepartmentForm";
import { ItemMasterForm } from "./components/forms/Masters/ItemMasterForm";
import ItemCategoryForm from "./components/forms/Masters/ItemCategoryForm";
import { ProjectMasterForm } from "./components/forms/Masters/ProjectMasterForm";
import { ToolProvider } from '@/contexts/ToolContext';
import { UserMasterForm } from "./components/forms/Masters/UserMasterForm";
import { UserRolesForm } from "./components/forms/Masters/UserRolesForm";
import { EmployeeMasterForm } from "./components/forms/Masters/EmployeeMasterForm";
import { CostCenterForm } from "./components/forms/Masters/CostCenterForm";
import { COAForm } from "./components/forms/Masters/COAForm";
import { BudgetPeriodForm } from "./components/forms/Masters/BudgetPeriodForm";
import { BudgetLineForm } from "./components/forms/Masters/BudgetLineForm";
import { UOMForm } from "./components/forms/Masters/UOMForm";
import { PaymentTermsForm } from "./components/forms/Masters/PaymentTermsForm";
import { ShippingTermsForm } from "./components/forms/Masters/ShippingTermsForm";
import { ShippingMethodForm } from "./components/forms/Masters/ShippingMethodForm";
import WorkflowManagementPage from "./pages/settings/WorkflowManagementPage";
import WorkflowDetailPage from "./pages/settings/WorkflowDetailPage";
import ConnectionsPage from "./pages/settings/ConnectionsPage";
import CreateConnectionPage from "./pages/settings/CreateConnectionPage";
import ConnectionDetailPage from "./pages/settings/ConnectionDetailPage";
import TenantOnboardingPage from "./pages/settings/TenantOnboardingPage";
import DemoDatabaseResetPage from "./pages/settings/DemoDatabaseResetPage";
import { SuperAdminGuard } from "./components/layout/SuperAdminGuard";
import { PromptTemplateForm } from "./components/forms/Masters/PromptTemplateForm";
import { AgentTemplateForm } from "./components/forms/Masters/AgentTemplateForm";
import { AITemplatesPage } from "./pages/settings/AITemplatesPage";
import { LLMTraceDetailPage } from "./components/forms/Masters/LLMTraceDetailPage";
import { TaxMasterForm } from "./components/forms/Masters/TaxMasterForm";
import { ViewForm } from "./components/forms/Masters/ViewForm";
import { PermissionForm } from "./components/forms/Masters/PermissionForm";
import { CategoryForm } from "./components/forms/Masters/CategoryForm";
import { CategoryGroupForm } from "./components/forms/Masters/CategoryGroupForm";
import { PostingForm } from "./components/forms/Masters/PostingForm";
import { AccountForm } from "./components/forms/Masters/AccountForm";
import AccountList from "./pages/AccountList";
import { TradeForm } from "./components/forms/Masters/TradeForm";
import { InstrumentForm } from "./components/forms/Masters/InstrumentForm";
import { HoldingForm } from "./components/forms/Masters/HoldingForm";
import { CustomersForm } from "./components/forms/Masters/CustomersForm";
import { QuotesForm } from "./components/forms/sales/QuotesForm";
import { SalesOrderForm } from "./components/forms/sales/SalesOrderForm";
import { DeliveryChallanForm } from "./components/forms/sales/DeliveryChallanForm";
import { CreditNoteForm } from "./components/forms/sales/CreditNoteForm";
import { useUserData } from "./hooks/useUserData";
import { appId } from "./config/brand";
import ProtectedRouteWithLoading from "./components/layout/ProtectedRouteWithLoading";
import { Loading } from "./components/ui/loading";
import Dashboard from "./pages/Dashboard";
import RequesterDashboard from "./pages/RequestDashboard";
import ProcurementApproverDashboard from "./pages/ProcurementDashboardApproval";
import InvoiceForm from "./components/InvoiceForm";
import { InvoiceUpload } from "./pages/Invoice/InvoiceUpload";
import BalanceSheet from "./pages/reports/BalanceSheet";
import IncomeStatement from "./pages/reports/IncomeStatement";
import CashFlow from "./pages/reports/CashFlow";
import PostingList from "./pages/reports/PostingList";
import SimpleTransactionList from "./pages/reports/SimpleTransactionList";
import Transactions from "./pages/Transactions";
import { ReportControllerProvider } from "./contexts/ReportControllerContext";
import { PaymentReceiptForm } from "./components/forms/Masters/PaymentReceiptForm";
import WorkbenchPage from "./pages/workbench/WorkbenchPage";
import { SessionView } from "./pages/workbench/SessionView";
import { InboxPage } from "./pages/workbench/InboxPage";
import { GoalSetter } from "./components/workbench/GoalSetter";

import { ExchangeRateForm } from "./components/forms/Masters/ExchangeRateForm";
import { CurrencyForm } from "./components/forms/Masters/CurrencyForm";
// Create a client
const queryClient = new QueryClient();

// Ant Design theme configuration
const antTheme = {
  token: {
    colorPrimary: '#7028a0',
    borderRadius: 6,
    fontFamily: 'Lato, sans-serif',
  },
};



const PublicAuthRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { loading, isMeApiLoading, isAuthenticated } = useAuth();

  if (loading || isMeApiLoading) {
    return <Loading message="Loading user data..." />;
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

// Main App component
const AppRoutes: React.FC = () => {

  // const { getUserRole } = useUserData();
  // console.log(getUserRole);
  return (
    <BrowserRouter>
      <AuthProvider>
        <ReportControllerProvider>
          <div className="font-lato">
            <Routes>
              <Route path="/sign-in" element={<PublicAuthRoute><SignInPage /></PublicAuthRoute>} />
              <Route path="/signup" element={<PublicAuthRoute><SignInPage /></PublicAuthRoute>} />
              <Route path="/auth" element={<PublicAuthRoute><SignInPage /></PublicAuthRoute>} />

              {/* Protected routes with AppLayout */}
              <Route path="/" element={
                <ProtectedRouteWithLoading>
                  <AppLayout />
                </ProtectedRouteWithLoading>
              }>
                {/* Unified Dashboard - shows different dashboards based on user role */}
                <Route index element={<UnifiedDashboard />} />

                {/* Reports */}
                <Route path="reports" element={<Reports />} />
                <Route path="reports/balance-sheet" element={<BalanceSheet />} />
                <Route path="reports/income-statement" element={<IncomeStatement />} />
                <Route path="reports/cash-flow" element={<CashFlow />} />
                <Route path="reports/posting-list" element={<PostingList />} />

                {/* Sales Routes */}
                <Route path="sales/customers" element={<Master type="customers" view="customers_view" displayName="Customers" />} />
                <Route path="customers/:id/view/:viewId" element={<CustomersForm />} />
                <Route path="customers/view/:viewId" element={<CustomersForm />} />

                <Route path="sales/quotes" element={<Master type="quote" view="quote_view" displayName="Quotes" />} />
                <Route path="quote/:id/view/:viewId" element={<QuotesForm />} />
                <Route path="quote/view/:viewId" element={<QuotesForm />} />

                <Route path="sales/sales-orders" element={<Master type="sales_order" view="sales_order_view" displayName="Sales Orders" />} />
                <Route path="sales_order/:id/view/:viewId" element={<SalesOrderForm />} />
                <Route path="sales_order/view/:viewId" element={<SalesOrderForm />} />

                <Route path="sales/invoices" element={<Master type="invoice" view="invoice_view" displayName="Invoices" supportPath="sales" />} />
                <Route path="sales/invoices/upload" element={<InvoiceUpload />} />
                <Route path="sales/invoices/state/:stateId" element={<Invoice />} />
                <Route path="sales/invoices/:id/state/:stateId" element={<InvoiceDetailsPage />} />
                <Route path="sales/invoice/:id/view/:viewId" element={<InvoiceForm />} />
                <Route path="invoice/view/:viewId" element={<InvoiceForm />} />

                <Route path="sales/delivery-challans" element={<Master type="delivery_challan" view="delivery_challan_view" displayName="Delivery Challans" />} />
                <Route path="delivery_challan/:id/view/:viewId" element={<DeliveryChallanForm />} />
                <Route path="delivery_challan/view/:viewId" element={<DeliveryChallanForm />} />

                <Route path="sales/payment-receipts" element={<Master type="payment_receipt" view="payment_receipt_view" displayName="Payment Receipts" />} />
                <Route path="payment_receipt/:id/view/:viewId" element={<PaymentReceiptForm />} />
                <Route path="payment_receipt/view/:viewId" element={<PaymentReceiptForm />} />

                <Route path="sales/credit-notes" element={<Master type="credit_note" view="credit_note_view" displayName="Credit Notes" />} />
                <Route path="credit_note/:id/view/:viewId" element={<CreditNoteForm />} />
                <Route path="credit_note/view/:viewId" element={<CreditNoteForm />} />

                {/* Purchases Routes */}
                <Route path="purchases/suppliers" element={<Master type="supplier" view="supplier_view" displayName="Suppliers" filterConfig={{ enableFilters: true, enableSearch: true, dateRangeFilter: { key: 'onboarded_date', label: 'Onboarded Date' } }} />} />
                <Route path="supplier/:id/view/:viewId" element={<SupplierForm />} />
                <Route path="supplier/view/:viewId" element={<SupplierForm />} />

                <Route path="purchases/requisitions" element={<PurchaseRequisitionDashboardPage />} />
                <Route path="purchases/requisitions/state/:stateId" element={<PurchaseRequisition />} />
                <Route path="purchases/requisitions/view/:viewId" element={<PurchaseRequisition />} />
                <Route path="purchases/requisitions/:id/state/:stateId" element={<PurchaseRequisitionDetailsPage />} />
                <Route path="purchases/requisitions/:id/view/:viewId" element={<PurchaseRequisitionDetailsPage />} />

                <Route path="purchases/orders" element={<PurchaseOrder />} />
                <Route path="purchases/orders/state/:stateId" element={<PurchaseOrder />} />
                <Route path="purchases/orders/:id/state/:stateId" element={<PurchaseOrderDetailsPage />} />
                <Route path="purchases/orders/:id/view/:viewId" element={<PurchaseOrderDetailsPage />} />

                <Route path="purchases/bills" element={<Invoice />} />
                <Route path="purchases/bills/upload" element={<InvoiceUpload />} />
                <Route path="purchases/bills/state/:stateId" element={<Invoice />} />
                <Route path="purchases/bills/:id/state/:stateId" element={<InvoiceDetailsPage />} />
                <Route path="purchases/bills/:id/view/:viewId" element={<InvoiceDetailsPage />} />
                <Route path="purchases/bills/form" element={<InvoiceForm />} />

                {/* Accounting Routes */}
                <Route path="accounting/transactions" element={<Transactions />} />
                <Route path="accounting/simple-transactions" element={<SimpleTransactionList />} />
                <Route path="posting/:id/view/:viewId" element={<PostingForm />} />
                <Route path="posting/view/:viewId" element={<PostingForm />} />

                <Route path="accounting/accounts" element={<AccountList />} />
                <Route path="account/:id/view/:viewId" element={<AccountForm />} />
                <Route path="account/view/:viewId" element={<AccountForm />} />

                <Route path="accounting/categories" element={<Master type="category" view="category_view" displayName="Categories" />} />
                <Route path="category/:id/view/:viewId" element={<CategoryForm />} />
                <Route path="category/view/:viewId" element={<CategoryForm />} />

                <Route path="accounting/category-groups" element={<Master type="category_group" view="category_group_view" displayName="Category Groups" />} />
                <Route path="category_group/:id/view/:viewId" element={<CategoryGroupForm />} />
                <Route path="category_group/view/:viewId" element={<CategoryGroupForm />} />

                <Route path="accounting/tax" element={<Master type="tax_master" view="tax_master_view" displayName="Tax Master" />} />
                <Route path="tax_master/:id/view/:viewId" element={<TaxMasterForm />} />
                <Route path="tax_master/view/:viewId" element={<TaxMasterForm />} />


                <Route path="accounting/currency" element={<Master type="currency" view="currency_view" displayName="Currency" isImport={false} />} />
                <Route path="currency/:id/view/:viewId" element={<CurrencyForm />} />
                <Route path="currency/view/:viewId" element={<CurrencyForm />} />

                <Route path="accounting/exchange-rates" element={<Master type="exchange_rate" view="exchange_rate_view" displayName="Exchange Rate" />} />
                <Route path="exchange_rate/:id/view/:viewId" element={<ExchangeRateForm />} />
                <Route path="exchange_rate/view/:viewId" element={<ExchangeRateForm />} />

                <Route path="accounting/payment-terms" element={<Master type="payment_terms" view="payment_terms_view" displayName="Payment Terms" />} />
                <Route path="payment_terms/:id/view/:viewId" element={<PaymentTermsForm />} />
                <Route path="payment_terms/view/:viewId" element={<PaymentTermsForm />} />

                <Route path="accounting/budget-periods" element={<Master type="budget_period" view="budget_period_view" displayName="Budget Periods" />} />
                <Route path="budget_period/:id/view/:viewId" element={<BudgetPeriodForm />} />
                <Route path="budget_period/view/:viewId" element={<BudgetPeriodForm />} />

                <Route path="accounting/budget-lines" element={<Master type="budget_line" view="budget_line_view" displayName="Budget Lines" />} />
                <Route path="budget_line/:id/view/:viewId" element={<BudgetLineForm />} />
                <Route path="budget_line/view/:viewId" element={<BudgetLineForm />} />

                {/* Masters - Items & Inventory */}
                <Route path="masters/items" element={<Master type="item_master" view="item_master_view" displayName="Item Master" />} />
                <Route path="item_master/:id/view/:viewId" element={<ItemMasterForm />} />
                <Route path="item_master/view/:viewId" element={<ItemMasterForm />} />

                <Route path="masters/item-categories" element={<Master type="item_category" view="item_category_view" displayName="Item Categories" />} />
                <Route path="item_category/:id/view/:viewId" element={<ItemCategoryForm />} />
                <Route path="item_category/view/:viewId" element={<ItemCategoryForm />} />

                <Route path="masters/uom" element={<Master type="uom" view="uom_view" displayName="Units of Measurement" />} />
                <Route path="uom/:id/view/:viewId" element={<UOMForm />} />
                <Route path="uom/view/:viewId" element={<UOMForm />} />

                {/* Masters - Organization */}
                <Route path="masters/entity" element={<Master type="entity" view="entity_view" displayName="Entity" />} />
                <Route path="entity/view/:viewId" element={<OrganizationForm />} />
                <Route path="entity/:id/view/:viewId" element={<OrganizationForm />} />

                <Route path="masters/locations" element={<Master type="location" view="location_view" displayName="Locations" />} />
                <Route path="location/:id/view/:viewId" element={<LocationForm />} />
                <Route path="location/view/:viewId" element={<LocationForm />} />

                <Route path="masters/business-units" element={<Master type="business_unit" view="business_unit_view" displayName="Business Units" />} />
                <Route path="business_unit/:id/view/:viewId" element={<BusinessUnitForm />} />
                <Route path="business_unit/view/:viewId" element={<BusinessUnitForm />} />

                <Route path="masters/departments" element={<Master type="department" view="department_view" displayName="Departments" />} />
                <Route path="department/:id/view/:viewId" element={<DepartmentForm />} />
                <Route path="department/view/:viewId" element={<DepartmentForm />} />

                <Route path="masters/projects" element={<Master type="project_master" view="project_master_view" displayName="Projects" />} />
                <Route path="project_master/:id/view/:viewId" element={<ProjectMasterForm />} />
                <Route path="project_master/view/:viewId" element={<ProjectMasterForm />} />

                <Route path="masters/cost-centers" element={<Master type="cost_center" view="cost_center_view" displayName="Cost Centers" />} />
                <Route path="cost_center/:id/view/:viewId" element={<CostCenterForm />} />
                <Route path="cost_center/view/:viewId" element={<CostCenterForm />} />

                {/* Masters - Shipping */}
                <Route path="masters/shipping-terms" element={<Master type="shipping_terms" view="shipping_terms_view" displayName="Shipping Terms" />} />
                <Route path="shipping_terms/:id/view/:viewId" element={<ShippingTermsForm />} />
                <Route path="shipping_terms/view/:viewId" element={<ShippingTermsForm />} />

                <Route path="masters/shipping-methods" element={<Master type="shipping_method" view="shipping_method_view" displayName="Shipping Methods" />} />
                <Route path="shipping_method/:id/view/:viewId" element={<ShippingMethodForm />} />
                <Route path="shipping_method/view/:viewId" element={<ShippingMethodForm />} />

                {/* Settings - User Management & System Config */}
                <Route path="settings/users" element={<Master type="user" view="user_view" displayName="Users" />} />
                <Route path="user/:id/view/:viewId" element={<UserMasterForm />} />
                <Route path="user/view/:viewId" element={<UserMasterForm />} />

                <Route path="settings/employees" element={<Master type="employee_master" view="employee_master_view" displayName="Employees" />} />
                <Route path="employee_master/:id/view/:viewId" element={<EmployeeMasterForm />} />
                <Route path="employee_master/view/:viewId" element={<EmployeeMasterForm />} />

                <Route path="settings/roles" element={<Master type="role" view="role_view" displayName="Roles" />} />
                <Route path="role/:id/view/:viewId" element={<UserRolesForm />} />
                <Route path="role/view/:viewId" element={<UserRolesForm />} />

                <Route path="settings/workflows" element={<WorkflowManagementPage />} />
                <Route path="settings/workflows/:flowId" element={<WorkflowDetailPage />} />
                <Route path="settings/connections" element={<ConnectionsPage />} />
                <Route path="settings/connections/new" element={<CreateConnectionPage />} />
                <Route path="settings/connections/new/:systemType" element={<CreateConnectionPage />} />
                <Route path="settings/connections/:id" element={<ConnectionDetailPage />} />
                <Route path="settings/views" element={<Master type="view" view="view" displayName="Views" defaultSortOption={{ field: 'model_name', direction: 'asc' }} />} />
                <Route path="view/:id/view/:viewId" element={<ViewForm />} />
                <Route path="view/view/:viewId" element={<ViewForm />} />

                <Route path="settings/permissions" element={<Master type="permission" view="permission_view" displayName="Permissions" />} />
                <Route path="permission/:id/view/:viewId" element={<PermissionForm />} />
                <Route path="permission/view/:viewId" element={<PermissionForm />} />

                <Route path="settings/ai-templates" element={<AITemplatesPage />} />
                <Route path="settings/prompt-templates" element={<AITemplatesPage />} />
                <Route path="prompt_template/:id/view/:viewId" element={<PromptTemplateForm />} />
                <Route path="prompt_template/view/:viewId" element={<PromptTemplateForm />} />
                <Route path="settings/agent-templates/new" element={<AgentTemplateForm />} />
                <Route path="settings/agent-templates/:id/edit" element={<AgentTemplateForm />} />

                <Route path="settings/llm-traces" element={
                  <Master
                    type="llm_trace"
                    view="llm_trace_view"
                    displayName="LLM Traces"
                    defaultSortOption={{ field: 'created_at', direction: 'desc' }}
                    listConfig={{ enableCreate: false }}
                  />
                } />
                <Route path="llm_trace/:id/view/:viewId" element={<LLMTraceDetailPage />} />

                <Route path="settings/tenant-onboarding" element={
                  <SuperAdminGuard>
                    <TenantOnboardingPage />
                  </SuperAdminGuard>
                } />

                <Route path="settings/demo-database-reset" element={
                  <SuperAdminGuard>
                    <DemoDatabaseResetPage />
                  </SuperAdminGuard>
                } />

                {/* Investments Routes */}
                <Route path="investments/instruments" element={<Master type="instrument" view="instrument_view" displayName="Instruments" />} />
                <Route path="instrument/:id/view/:viewId" element={<InstrumentForm />} />
                <Route path="instrument/view/:viewId" element={<InstrumentForm />} />

                <Route path="investments/holdings" element={<Master type="holding" view="holding_view" displayName="Holdings" />} />
                <Route path="holding/:id/view/:viewId" element={<HoldingForm />} />
                <Route path="holding/view/:viewId" element={<HoldingForm />} />

                <Route path="investments/trades" element={<Master type="trade" view="trade_view" displayName="Trades" />} />
                <Route path="trade/:id/view/:viewId" element={<TradeForm />} />
                <Route path="trade/view/:viewId" element={<TradeForm />} />

                {/* Agent Workbench */}
                <Route path="workbench" element={<WorkbenchPage />}>
                  <Route index element={<GoalSetter />} />
                  {/* inbox routes must be declared before :sessionId */}
                  <Route path="inbox" element={<InboxPage />} />
                  <Route path="inbox/:actionId" element={<InboxPage />} />
                  <Route path=":sessionId" element={<SessionView />} />
                </Route>

                {/* Catch all route */}
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </div>
        </ReportControllerProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};

const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider theme={antTheme}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <ChatProvider>
            <ToolProvider>
              <AppRoutes />
            </ToolProvider>
          </ChatProvider>
        </TooltipProvider>
      </ConfigProvider>
    </QueryClientProvider>
  );
};

export default App;

