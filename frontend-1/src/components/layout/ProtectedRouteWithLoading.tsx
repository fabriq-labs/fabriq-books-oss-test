import React, { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, useLocation } from "react-router-dom";
import { Loading } from "@/components/ui/loading";
import { buildSignInRedirect } from "@/lib/authRedirect";

interface ProtectedRouteWithLoadingProps {
    children: React.ReactNode;
}

export const ProtectedRouteWithLoading: React.FC<ProtectedRouteWithLoadingProps> = ({ children }) => {
    const { loading, isMeApiLoading, isAuthenticated } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        if (!loading && !isMeApiLoading && !isAuthenticated) {
            navigate(buildSignInRedirect(location.pathname, location.search), { replace: true });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loading, isMeApiLoading, isAuthenticated, location.pathname, location.search]);

    // Show loading screen while authentication is being checked
    if (loading || isMeApiLoading) {
        return <Loading message="Loading user data..." />;
    }

    // If not authenticated, redirect to sign-in (handled by the effect above)
    if (!isAuthenticated) {
        return <Loading message="Redirecting to sign-in..." />;
    }

    // If authenticated, render the protected content
    return <>{children}</>;
};

export default ProtectedRouteWithLoading;