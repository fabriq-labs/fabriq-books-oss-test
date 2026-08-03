import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useIsMobileDevice } from "@/hooks/useIsMobileDevice";
import { MOBILE_ROUTE_MAP, isMobileOptedOut } from "@/config/mobileRoutes";

interface MobileRedirectGateProps {
  children: React.ReactNode;
}

/**
 * Sends phone users into the /m/* mobile UI for routes that have one.
 * Routes without a mobile equivalent render normally (desktop UI, responsive
 * as it already is) — this only redirects where MOBILE_ROUTE_MAP has an entry.
 */
export function MobileRedirectGate({ children }: MobileRedirectGateProps) {
  const location = useLocation();
  const isMobileDevice = useIsMobileDevice();
  const target = MOBILE_ROUTE_MAP[location.pathname];

  if (isMobileDevice && target && !isMobileOptedOut()) {
    return <Navigate to={target} replace />;
  }

  return <>{children}</>;
}
