import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Menu, UserRound, LogOut, MessageSquare, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from '@/contexts/AuthContext';
import { useUserData } from '@/hooks/useUserData';
import { useChat } from '@/contexts/ChatContext';
import { useIsMobileDevice } from '@/hooks/useIsMobileDevice';
import { isMobileOptedOut, setMobileOptedOut } from '@/config/mobileRoutes';
import { User } from '@/models/User';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarLogo } from "./sidebar/SidebarLogo";
import { MyProfileModal } from "./MyProfileModal";

interface TopBarProps {
  title: string;
  toggleSidebar: () => void;
}

const TopBar: React.FC<TopBarProps> = ({ title, toggleSidebar }) => {
  const [profileOpen, setProfileOpen] = useState(false);
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { toggleChat } = useChat();
  const isMobileDevice = useIsMobileDevice();
  const showSwitchToMobile = isMobileDevice && isMobileOptedOut();

  const handleSwitchToMobile = () => {
    setMobileOptedOut(false);
    navigate("/", { replace: true });
  };
  const {
    user,
    getUserName,
    getUserEmail,
    getUserOrganization,
    getUserInitials,
    getBaseCurrencyDetails
  } = useUserData();

  // Check if chat is enabled via environment variable
  const isChatEnabled = import.meta.env.VITE_ENABLE_AI === 'true';

  const handleLogout = () => {
    logout();
  };

  return (
    <header className="fixed top-0 left-0 right-0 h-16 border-b bg-white flex items-center px-4 z-50">
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleSidebar}
        className="mr-4"
      >
        <Menu className="h-5 w-5" />
      </Button>

      <div className="flex items-center gap-4">
        <h1 className="text-xl font-semibold text-gray-800">
          <SidebarLogo collapsed={false} />
        </h1>
        {/* <div className="text-sm text-gray-500">
          {getUserOrganization()} • {getBaseCurrencyDetails().base_currency}
        </div> */}
      </div>

      <div className="ml-auto flex items-center gap-2">
        {isChatEnabled && (
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleChat}
          >
            <MessageSquare className="h-5 w-5 text-gray-600" />
          </Button>
        )}

        <div className="ml-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Avatar className="h-8 w-8 cursor-pointer">
                {/* Use empty string to force fallback when no image, or actual image URL if available */}
                <AvatarImage
                  src={(user as User & { image?: string })?.image || ''}
                  alt={getUserName()}
                />
                <AvatarFallback className="bg-primary text-primary-foreground font-semibold text-xs">
                  {getUserInitials()}
                </AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="flex flex-col">
                <span className="text-sm font-semibold text-gray-900">
                  {getUserName()}
                </span>
                <span className="text-xs text-gray-500">
                  {getUserEmail()}
                </span>
                <span className="text-xs text-gray-400">
                  {getUserOrganization()} • {getBaseCurrencyDetails().base_currency}
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="flex items-center gap-2 cursor-pointer"
                onSelect={(e) => {
                  e.preventDefault();
                  setProfileOpen(true);
                }}
              >
                <UserRound className="h-4 w-4" />
                <span>My Profile</span>
              </DropdownMenuItem>
              {showSwitchToMobile && (
                <DropdownMenuItem
                  className="flex items-center gap-2 cursor-pointer"
                  onClick={handleSwitchToMobile}
                >
                  <Smartphone className="h-4 w-4" />
                  <span>Switch to mobile site</span>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="flex items-center gap-2 cursor-pointer text-destructive"
                onClick={handleLogout}
              >
                <LogOut className="h-4 w-4" />
                <span>Logout</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <MyProfileModal open={profileOpen} onOpenChange={setProfileOpen} />
    </header>
  );
};

export default TopBar;