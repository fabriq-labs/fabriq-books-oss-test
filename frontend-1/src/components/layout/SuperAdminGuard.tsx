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
  const { user, isSuperAdmin } = useUserRoles();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    if (!isSuperAdmin()) {
      navigate("/", { replace: true });
    }
    // isSuperAdmin reads latest `user` from hook; avoid unstable function ref in deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, navigate]);

  if (!user) {
    return <Loading message="Loading..." />;
  }
  if (!isSuperAdmin()) {
    return <Loading message="Redirecting..." />;
  }
  return <>{children}</>;
}
