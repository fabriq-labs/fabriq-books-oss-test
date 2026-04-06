import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { Link, useLocation } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@/components/ui/collapsible';

interface NavItemProps {
  icon: React.ElementType;
  label: string;
  path?: string;
  collapsed: boolean;
  active?: boolean;
  subNav?: { label: string; path: string }[];
}

export const NavItem: React.FC<NavItemProps> = ({
  icon: Icon,
  label,
  path = '#',
  collapsed,
  active = false,
  subNav = []
}) => {
  const location = useLocation();
  const hasSubNav = subNav.length > 0;
  const isSubNavActive = subNav?.some(item =>
    location?.pathname?.startsWith(item?.path)
  );
  const [open, setOpen] = useState(isSubNavActive);

  useEffect(() => {
    if (!collapsed && isSubNavActive) {
      setOpen(true);
    }
  }, [collapsed, isSubNavActive]);

  if (hasSubNav) {
    return (
      <Collapsible
        open={open}
        onOpenChange={setOpen}
        className={cn("w-full", collapsed && "items-center")}
      >
        <CollapsibleTrigger asChild>
          <button
            className={cn(
              "flex items-center w-full p-2 rounded-md text-left",
              collapsed ? "justify-center" : "justify-between",
              isSubNavActive ? "bg-primary-50 text-primary-600" : "hover:bg-primary-50 hover:text-primary-600"
            )}
          >
            <span className={cn("flex items-center", collapsed && "justify-center")}>
              <Icon className="h-5 w-5 mr-2" />
              {!collapsed && <span className="text-sm font-medium">{label}</span>}
            </span>
            {!collapsed && (open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />)}
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent className={cn("pl-7 mt-1", collapsed && "hidden")}>
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
        active ? "bg-primary-50 text-primary-600" : "hover:bg-primary-50 hover:text-primary-600"
      )}
    >
      <Icon className="h-5 w-5 mr-2" />
      {!collapsed && <span className="text-sm font-medium">{label}</span>}
    </Link>
  );
};