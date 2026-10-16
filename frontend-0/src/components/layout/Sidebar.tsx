import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  FileText,
  FileCheck,
  FileSpreadsheet,
  BarChart3,
  Database,
  Briefcase,
  Building2,
  MapPin,
  Building,
  FolderKanban,
  FileCode2,
  Users,
  UserCog,
  User,
  Package2,
  Tags,
  Box,
  Store,
  DollarSign,
  Landmark,
  BookOpen,
  CalendarRange,
  CalendarClock,
  MoreHorizontal,
  CreditCard,
  Ship,
  Truck,
  Coins,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { SidebarLogo } from "./sidebar/SidebarLogo";
import { SidebarNavigation } from "./sidebar/SidebarNavigation";

interface SidebarProps {
  collapsed: boolean;
}

interface NavItemProps {
  icon: React.ElementType;
  label: string;
  path?: string;
  collapsed: boolean;
  active?: boolean;
  subNav?: { label: string; path: string }[];
}

interface NavGroupProps {
  label: string;
  icon: React.ElementType;
  children: React.ReactNode;
  collapsed: boolean;
}

const NavItem: React.FC<NavItemProps> = ({
  icon: Icon,
  label,
  path = "#",
  collapsed,
  active = false,
  subNav,
}) => {
  const [open, setOpen] = useState(false);
  const hasSubNav = subNav && subNav.length > 0;
  const location = useLocation();

  if (hasSubNav) {
    return (
      <Collapsible
        open={open}
        onOpenChange={setOpen}
        className={cn("w-full", collapsed ? "items-center" : "")}
      >
        <CollapsibleTrigger asChild>
          <button
            className={cn(
              "flex items-center w-full p-2 rounded-md text-left",
              collapsed ? "justify-center" : "justify-between",
              open
                ? "bg-primary-50 text-primary-600"
                : "hover:bg-primary-50 hover:text-primary-600"
            )}
          >
            <span
              className={cn(
                "flex items-center",
                collapsed ? "justify-center" : ""
              )}
            >
              <Icon className="h-5 w-5 mr-2" />
              {!collapsed && (
                <span className="text-sm font-medium">{label}</span>
              )}
            </span>
            {!collapsed &&
              (open ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              ))}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent
          className={cn("pl-7 mt-1", collapsed ? "hidden" : "")}
        >
          {subNav.map((item, i) => (
            <Link
              key={i}
              to={item.path}
              className={cn(
                "flex items-center p-2 rounded-md text-sm",
                location.pathname === item.path
                  ? "bg-primary-50 text-primary-600"
                  : "hover:bg-primary-50 hover:text-primary-600"
              )}
            >
              {item.label}
            </Link>
          ))}
        </CollapsibleContent>
      </Collapsible>
    );
  }

  return (
    <Link
      to={path}
      className={cn(
        "flex items-center p-2 rounded-md",
        collapsed ? "justify-center" : "",
        active
          ? "bg-primary-50 text-primary-600"
          : "hover:bg-primary-50 hover:text-primary-600"
      )}
    >
      <Icon className="h-5 w-5 mr-2" />
      {!collapsed && <span className="text-sm font-medium">{label}</span>}
    </Link>
  );
};

const NavGroup: React.FC<NavGroupProps> = ({
  label,
  icon: Icon,
  children,
  collapsed,
}) => {
  return (
    <div className="mt-6 space-y-1.5">
      {!collapsed && (
        <div className="flex items-center px-3 text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
          <Icon className="h-4 w-4 mr-2" />
          <span>{label}</span>
        </div>
      )}
      {children}
    </div>
  );
};

export const Sidebar: React.FC<SidebarProps> = ({ collapsed }) => {
  const location = useLocation();

  return (
    <div className="h-full py-4 px-3">
      {/* <SidebarLogo collapsed={collapsed} /> */}
      <SidebarNavigation collapsed={collapsed} />
    </div>
  );
};