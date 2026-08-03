import React from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { LogOut, Monitor, BarChart3, TrendingUp } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { setMobileOptedOut } from "@/config/mobileRoutes";

const TABS = [
  { to: "/m/investments/portfolio", label: "Portfolio", icon: BarChart3 },
  { to: "/m/investments/options-income", label: "Options", icon: TrendingUp },
];

const routeTitles: Record<string, string> = {
  "/m/investments/portfolio": "Portfolio",
  "/m/investments/options-income": "Options Income",
};

export const MobileLayout: React.FC = () => {
  const { logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const title = routeTitles[location.pathname] ?? "Fabriq";

  const switchToDesktop = () => {
    setMobileOptedOut(true);
    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Fixed top bar */}
      <header className="fixed top-0 left-0 right-0 h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 z-40">
        <h1 className="text-base font-semibold text-slate-900">{title}</h1>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={switchToDesktop}
            aria-label="Switch to full site"
            className="p-2 text-slate-500 active:text-slate-800"
          >
            <Monitor className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={logout}
            aria-label="Log out"
            className="p-2 -mr-2 text-slate-500 active:text-slate-800"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Scrollable content */}
      <main className="flex-1 pt-14 pb-16 overflow-y-auto">
        <Outlet />
      </main>

      {/* Fixed bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-slate-200 flex z-40">
        {TABS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                "flex-1 flex flex-col items-center justify-center gap-0.5 text-xs font-medium",
                isActive ? "text-blue-600" : "text-slate-400"
              )
            }
          >
            <Icon className="h-5 w-5" />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
};

export default MobileLayout;
