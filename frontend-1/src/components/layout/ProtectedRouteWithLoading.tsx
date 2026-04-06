import React from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Loading } from "@/components/ui/loading";

interface ProtectedRouteWithLoadingProps {
    children: React.ReactNode;
}

export const ProtectedRouteWithLoading: React.FC<ProtectedRouteWithLoadingProps> = ({ children }) => {
    const { loading, isMeApiLoading, isAuthenticated } = useAuth();
    const navigate = useNavigate();

    // Show loading screen while authentication is being checked
    if (loading || isMeApiLoading) {
        return <Loading message="Loading user data..." />;
    }

    // If not authenticated, redirect to sign-in
    if (!isAuthenticated) {
        navigate('/sign-in');
        return <Loading message="Redirecting to sign-in..." />;
    }

    // If authenticated, render the protected content
    return <>{children}</>;
};

export default ProtectedRouteWithLoading;