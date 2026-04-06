
import React from 'react';
import { cn } from '@/lib/utils';
import { useUserData } from '@/hooks/useUserData';
import { sidebarFallbackName } from '@/config/brand';

interface SidebarLogoProps {
  collapsed: boolean;
}

export const SidebarLogo: React.FC<SidebarLogoProps> = ({ collapsed }) => {
  const { getOrganizationLogo, getUserOrganization } = useUserData();
  const orgLogo = getOrganizationLogo();
  const orgName = getUserOrganization();

  return (
    <div className="flex items-center justify-center">
      {collapsed ? (
        orgLogo ? (
          <img
            src={orgLogo}
            alt={orgName}
            className="h-8 w-8 rounded-md object-cover"
          />
        ) : (
          <div className="h-8 w-8 bg-primary-600 rounded-md flex items-center justify-center text-white font-bold">
            {orgName.charAt(0).toUpperCase()}
          </div>
        )
      ) : (
        <div className="flex items-center gap-2">
          {/* {orgLogo && (
            <img
              src={orgLogo}
              alt={orgName}
              className="h-6 w-6 rounded object-cover"
            />
          )} */}
          <div className="text-xl font-bold text-primary-600">
            {orgName === 'No Organization' ? sidebarFallbackName : orgName}
          </div>
        </div>
      )}
    </div>
  );
};
