import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from "react-router-dom";
import { ConfigProvider } from 'antd';
import { ChatProvider } from "./contexts/ChatContext";
import { ChatAuthSync } from "./components/chat/ChatAuthSync";
import { AppLayout } from "./components/layout/AppLayout";
import NotFound from "./pages/NotFound";
import SignInPage from "./pages/sign-in";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { EntityProvider } from "./contexts/EntityContext";
import { ToolProvider } from '@/contexts/ToolContext';
import { UserMasterForm } from "./components/forms/Masters/UserMasterForm";
import { DepartmentForm } from "./components/forms/Masters/DepartmentForm";
import { UserRolesForm } from "./components/forms/Masters/UserRolesForm";
import WorkflowManagementPage from "./pages/settings/WorkflowManagementPage";
import WorkflowDetailPage from "./pages/settings/WorkflowDetailPage";
import { SuperAdminGuard } from "./components/layout/SuperAdminGuard";
import { PromptTemplateForm } from "./components/forms/Masters/PromptTemplateForm";
import { AgentTemplateForm } from "./components/forms/Masters/AgentTemplateForm";
import { AgentModelToolsForm } from "./components/forms/Masters/AgentModelToolsForm";
import { AITemplatesPage } from "./pages/settings/AITemplatesPage";
import { LLMTraceDetailPage } from "./components/forms/Masters/LLMTraceDetailPage";
import { LLMTracesPage } from "./pages/settings/LLMTracesPage";
import { ViewForm } from "./components/forms/Masters/ViewForm";
import { PermissionForm } from "./components/forms/Masters/PermissionForm";
import Master from "./pages/Master";
import { Loading } from "./components/ui/loading";
import { getSafeRedirectTarget } from "./lib/authRedirect";
import WorkbenchPage from "./pages/workbench/WorkbenchPage";
import { SessionView } from "./pages/workbench/SessionView";
import { InboxPage } from "./pages/workbench/InboxPage";
import { GoalSetter } from "./components/workbench/GoalSetter";
import DomainMaster from "./domain/DomainMaster";
import { DomainHome } from "./domain/home";
import { DomainRoutes, DomainShellGate, DomainStandaloneRoutes } from "./domain/routes";
import ProtectedRouteWithLoading from "./components/layout/ProtectedRouteWithLoading";

const queryClient = new QueryClient();

const antTheme = {
  token: {
    colorPrimary: '#7028a0',
    borderRadius: 6,
    fontFamily: 'Lato, sans-serif',
  },
};

const PublicAuthRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { loading, isMeApiLoading, isAuthenticated } = useAuth();
  const location = useLocation();

  if (loading || isMeApiLoading) {
    return <Loading message="Loading user data..." />;
  }

  if (isAuthenticated) {
    return <Navigate to={getSafeRedirectTarget(location.search)} replace />;
  }

  return <>{children}</>;
};

const AppRoutes: React.FC = () => {
  return (
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <AuthProvider>
        <EntityProvider>
        <ChatAuthSync />
        <div className="font-lato">
          <Routes>
            <Route path="/sign-in" element={<PublicAuthRoute><SignInPage /></PublicAuthRoute>} />
            <Route path="/signup" element={<PublicAuthRoute><SignInPage /></PublicAuthRoute>} />
            <Route path="/auth" element={<PublicAuthRoute><SignInPage /></PublicAuthRoute>} />

            <Route element={
              <ProtectedRouteWithLoading>
                <Outlet />
              </ProtectedRouteWithLoading>
            }>
              {DomainStandaloneRoutes()}
            </Route>

            <Route path="/" element={
              <ProtectedRouteWithLoading>
                <DomainShellGate>
                  <AppLayout />
                </DomainShellGate>
              </ProtectedRouteWithLoading>
            }>
              <Route index element={<DomainHome />} />

              <Route path="master/:category/:model" element={<DomainMaster />} />

              {DomainRoutes()}

              <Route path="settings/users" element={<Master type="user" view="user_view" displayName="Users" />} />
              <Route path="accounting/currency" element={
                <SuperAdminGuard>
                  <Master type="currency" view="currency_view" displayName="Currency" />
                </SuperAdminGuard>
              } />
              <Route path="user/:id/view/:viewId" element={<UserMasterForm />} />
              <Route path="user/view/:viewId" element={<UserMasterForm />} />
              <Route path="settings/departments" element={<Master type="department" view="department_view" displayName="Departments" />} />
              <Route path="department/:id/view/:viewId" element={<DepartmentForm />} />
              <Route path="department/view/:viewId" element={<DepartmentForm />} />

              <Route path="settings/roles" element={
                <SuperAdminGuard>
                  <Master type="role" view="role_view" displayName="Roles" />
                </SuperAdminGuard>
              } />
              <Route path="role/:id/view/:viewId" element={<SuperAdminGuard><UserRolesForm /></SuperAdminGuard>} />
              <Route path="role/view/:viewId" element={<SuperAdminGuard><UserRolesForm /></SuperAdminGuard>} />

              <Route path="settings/workflows" element={<SuperAdminGuard><WorkflowManagementPage /></SuperAdminGuard>} />
              <Route path="settings/workflows/:flowId" element={<SuperAdminGuard><WorkflowDetailPage /></SuperAdminGuard>} />

              <Route path="settings/views" element={
                <SuperAdminGuard>
                  <Master type="view" view="view" displayName="Views" defaultSortOption={{ field: 'model_name', direction: 'asc' }} />
                </SuperAdminGuard>
              } />
              <Route path="view/:id/view/:viewId" element={<SuperAdminGuard><ViewForm /></SuperAdminGuard>} />
              <Route path="view/view/:viewId" element={<SuperAdminGuard><ViewForm /></SuperAdminGuard>} />

              <Route path="settings/permissions" element={
                <SuperAdminGuard>
                  <Master type="permission" view="permission_view" displayName="Permissions" />
                </SuperAdminGuard>
              } />
              <Route path="permission/:id/view/:viewId" element={<SuperAdminGuard><PermissionForm /></SuperAdminGuard>} />
              <Route path="permission/view/:viewId" element={<SuperAdminGuard><PermissionForm /></SuperAdminGuard>} />

              <Route path="settings/ai-templates" element={<SuperAdminGuard><AITemplatesPage /></SuperAdminGuard>} />
              <Route path="settings/prompt-templates" element={<SuperAdminGuard><AITemplatesPage /></SuperAdminGuard>} />
              <Route path="prompt_template/:id/view/:viewId" element={<SuperAdminGuard><PromptTemplateForm /></SuperAdminGuard>} />
              <Route path="prompt_template/view/:viewId" element={<SuperAdminGuard><PromptTemplateForm /></SuperAdminGuard>} />
              <Route path="settings/agent-templates/new" element={<SuperAdminGuard><AgentTemplateForm /></SuperAdminGuard>} />
              <Route path="settings/agent-templates/:id/edit" element={<SuperAdminGuard><AgentTemplateForm /></SuperAdminGuard>} />
              <Route path="settings/agent-model-tools/:modelName/edit" element={<SuperAdminGuard><AgentModelToolsForm /></SuperAdminGuard>} />
              <Route path="settings/llm-traces" element={<SuperAdminGuard><LLMTracesPage /></SuperAdminGuard>} />
              <Route path="llm_trace/:id/view/:viewId" element={<SuperAdminGuard><LLMTraceDetailPage /></SuperAdminGuard>} />

              <Route path="workbench" element={<WorkbenchPage />}>
                <Route index element={<GoalSetter />} />
                <Route path="inbox" element={<InboxPage />} />
                <Route path="inbox/:actionId" element={<InboxPage />} />
                <Route path=":sessionId" element={<SessionView />} />
              </Route>

              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </div>
        </EntityProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ConfigProvider theme={antTheme}>
      <TooltipProvider>
        <ChatProvider>
          <ToolProvider>
            <Toaster />
            <Sonner />
            <AppRoutes />
          </ToolProvider>
        </ChatProvider>
      </TooltipProvider>
    </ConfigProvider>
  </QueryClientProvider>
);

export default App;
