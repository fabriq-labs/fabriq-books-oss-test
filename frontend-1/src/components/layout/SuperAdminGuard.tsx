import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useUserRoles } from "@/hooks/useUserRoles";
import { Loading } from "@/components/ui/loading";

interface SuperAdminGuardProps {
  children: React.ReactNode;
}

/**
 * Renders children only if the current user has the Super Admin role.
 * Otherwise redirects to dashboard (and shows loading while checking).
 */
export function SuperAdminGuard({ children }: SuperAdminGuardProps) {
  const { hasRole, user } = useUserRoles();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    if (!hasRole("Super Admin")) {
      navigate("/", { replace: true });
    }
  }, [user, hasRole, navigate]);

  if (!user) {
    return <Loading message="Loading..." />;
  }
  if (!hasRole("Super Admin")) {
    return <Loading message="Redirecting..." />;
  }
  return <>{children}</>;
}
