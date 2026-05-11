import React, { useEffect } from 'react';
import { useUserRoles } from '@/hooks/useUserRoles';
import RequesterDashboard from '@/pages/RequestDashboard';
import ProcurementApproverDashboard from '@/pages/ProcurementDashboardApproval';
import FabriqDashboard from './FabriqDashboard';
import { appName, sidebarFallbackName } from '@/config/brand';

const UnifiedDashboard: React.FC = () => {
    const { isBuyer, isFinanceTeam } = useUserRoles();

    // Update document title based on user role
    useEffect(() => {
        if (isFinanceTeam()) {
            document.title = `Dashboard - ${appName}`;
        } else if (isBuyer()) {
            document.title = `PA Dashboard - ${sidebarFallbackName}`;
        } else {
            document.title = `Requester Dashboard - ${sidebarFallbackName}`;
        }
    }, [isFinanceTeam, isBuyer]);

    // Show entity-branching dashboard for Finance Team users
    if (isFinanceTeam()) {
        return <FabriqDashboard />;
    }

    // If user is a buyer, show procurement approver dashboard
    if (isBuyer()) {
        return <ProcurementApproverDashboard />;
    }

    // Otherwise, show requester dashboard
    return <RequesterDashboard />;
};

export default UnifiedDashboard; 