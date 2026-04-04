import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Sidebar } from './Sidebar';
import TopBar from './TopBar';
import { useIsMobile } from '@/hooks/use-mobile';
import { useLocation, Outlet } from 'react-router-dom';
import { useChat } from '@/contexts/ChatContext';
import { ChatUI } from '@/components/chat/ChatUI';
import { useUserRoles } from '@/hooks/useUserRoles';

// Route title mapping
const routeTitles: Record<string, string> = {
    '/': 'Dashboard',
    '/requisition': 'Purchase Requisitions',
    '/purchase-order': 'Purchase Orders',
    '/invoice': 'Invoice',
    '/reports': 'Reports',
    '/master/business/organization': 'Organization',
    '/master/procurement/items': 'Item Master',
    '/master/procurement/category': 'Item Category',
    '/master/procurement/supplier': 'Supplier',
    '/master/business/location': 'Location',
    '/master/business/unit': 'Business Unit',
    '/master/business/department': 'Department',
    '/master/business/project': 'Project Master',
    '/master/users/list': 'Users',
    '/master/users/employees': 'Employee Master',
    '/master/users/roles': 'User Roles',
    '/master/finance/cost-center': 'Cost Center',
    '/master/others/uom': 'Unit of Measurements',
    '/master/finance/chart-accounts': 'Account',
    '/master/finance/ledger': 'General Ledger',
    '/master/finance/budget-period': 'Budget Period',
    '/master/finance/budget-line': 'Budget Line',
    '/master/others/payment-terms': 'Payment Terms',
    '/master/others/shipping-terms': 'Shipping Terms',
    '/master/others/shipping-method': 'Shipping Method',
    '/master/others/currency': 'Currency Master',
    '/master/others/tax-master': 'Tax Master',
    '/settings/tenant-onboarding': 'Tenant Onboarding',
};

// Helper function to get title from route
const getTitleFromRoute = (pathname: string, isBuyer: boolean): string => {
    // Special handling for dashboard route
    if (pathname === '/') {
        return isBuyer ? 'PA Dashboard' : 'Requester Dashboard';
    }

    // Check exact matches first
    if (routeTitles[pathname]) {
        return routeTitles[pathname];
    }

    // Check for dynamic routes (with parameters)
    const pathSegments = pathname.split('/');

    // Handle form routes (e.g., /organization/view/:viewId)
    if (pathSegments.length >= 3 && pathSegments[2] === 'view') {
        const entity = pathSegments[1];
        const entityTitles: Record<string, string> = {
            'organization': 'Organization',
            'item_master': 'Item Master',
            'item_category': 'Item Category',
            'supplier': 'Supplier',
            'location': 'Location',
            'business_unit': 'Business Unit',
            'department': 'Department',
            'project_master': 'Project Master',
            'user': 'User',
            'user_master': 'User Master',
            'employee_master': 'Employee Master',
            'user_roles': 'User Roles',
            'cost_center': 'Cost Center',
            'account': 'Account',
            'general_ledger': 'General Ledger',
            'budget_period': 'Budget Period',
            'budget_line': 'Budget Line',
            'uom': 'Unit of Measure',
            'payment_terms': 'Payment Terms',
            'shipping_terms': 'Shipping Terms',
            'shipping_method': 'Shipping Method',
            'currency_master': 'Currency Master',
            'exchange_rates': 'Exchange Rates',
            'currency': 'Currency',
        };

        if (entityTitles[entity]) {
            return entityTitles[entity];
        }
    }

    // Handle requisition detail routes
    if ((pathname.includes('/purchases/requisitions/') || pathname.includes('/purchase_requisition/')) && pathname.includes('/state/')) {
        return 'Purchase Requisitions';
    }

    if ((pathname.includes('/purchases/requisitions/') || pathname.includes('/purchase_requisition/')) && pathname.includes('/view/')) {
        return 'Purchase Requisitions';
    }

    if ((pathname.includes('/purchases/orders/') || pathname.includes('/purchase_order/')) && pathname.includes('/state/')) {
        return 'Purchase Orders';
    }

    if ((pathname.includes('/purchases/orders/') || pathname.includes('/purchase_order/')) && pathname.includes('/view/')) {
        return 'Purchase Orders';
    }

    if ((pathname.includes('/purchases/bills/') || pathname.includes('/invoice/')) && pathname.includes('/state/')) {
        return 'Invoice';
    }

    if ((pathname.includes('/purchases/bills/') || pathname.includes('/invoice/')) && pathname.includes('/view/')) {
        return 'Invoice';
    }

    // Default fallback
    return 'Dashboard';
};

const breadcrumbMap: Record<string, string> = {
    '/': 'Dashboard',
    '/purchases/requisitions': 'Purchase Requisitions',
    '/purchases/orders': 'Purchase Orders',
    '/purchases/bills': 'Invoice',
    '/reports': 'Reports',
    '/insights': 'Insights',
    '/master': 'Master Data',
    '/settings': 'Settings'
};

export const AppLayout: React.FC = () => {
    const [collapsed, setCollapsed] = useState(false);
    const isMobile = useIsMobile();
    const location = useLocation();
    const { isChatOpen } = useChat();
    const { isBuyer } = useUserRoles();
    const [currentTitle, setCurrentTitle] = useState('Dashboard');

    const isDashboard = location.pathname === '/';
    const showChatSidebar = isChatOpen && !isDashboard;

    // Update title when route changes
    useEffect(() => {
        const title = getTitleFromRoute(location.pathname, isBuyer());
        setCurrentTitle(title);
    }, [location.pathname, isBuyer]);

    return (
        <div className="min-h-screen">
            {/* Fixed Top Navigation */}
            <TopBar
                title={currentTitle}
                toggleSidebar={() => setCollapsed(!collapsed)}
            />

            {/* Fixed Left Sidebar - 2 columns out of 12 */}
            <aside
                className={cn(
                    'fixed left-0 top-16 bottom-0 z-30 bg-gray-50 border-r overflow-y-auto transition-all duration-500 ease-in-out',
                    isMobile ? 'w-0 hidden' : (collapsed ? 'w-[4.5rem]' : 'w-[16.666%]')
                )}
            >
                <Sidebar collapsed={isMobile ? true : collapsed} />
            </aside>

            {/* Main Content Area - 10 columns (or 9 if chat sidebar shown) */}
            <main
                className={cn(
                    'fixed top-16 bottom-0 overflow-y-auto transition-all duration-500 ease-in-out p-4 md:p-6',
                    isMobile
                        ? 'left-0 right-0'
                        : [
                            collapsed ? 'left-[4.5rem]' : 'left-[16.666%]',
                            showChatSidebar ? 'right-[20.666%]' : 'right-0'
                        ]
                )}
            >
                <Outlet />
            </main>

            {/* Fixed Right Chat Sidebar - 2 columns out of 12, only on non-dashboard routes */}
            {showChatSidebar && !isMobile && (
                <aside
                    className="fixed right-0 top-16 bottom-0 z-40 w-[20.666%] bg-white border-l shadow-lg flex flex-col transition-transform duration-500 ease-in-out overflow-hidden"
                >
                    <ChatUI sidebarMode={true} />
                </aside>
            )}
        </div>
    );
}; 