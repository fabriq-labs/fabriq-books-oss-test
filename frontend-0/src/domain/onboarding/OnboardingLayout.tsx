import React from 'react';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { appName } from '@/config/brand';

/** Full-viewport frame for first-run screens: shell top bar height and gray canvas, no sidebar. */
export function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="h-16 shrink-0 border-b bg-white flex items-center px-4 sm:px-6">
        <div className="text-xl font-bold text-primary-600">{appName}</div>
        <div className="ml-auto flex items-center gap-3">
          {user?.email && (
            <span className="hidden sm:inline text-sm text-gray-500">{user.email}</span>
          )}
          <Button variant="ghost" size="sm" onClick={logout} className="text-gray-600">
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
        </div>
      </header>
      <main className="flex-1 w-full px-4 py-8 sm:py-12">
        <div className="mx-auto w-full max-w-xl">{children}</div>
      </main>
    </div>
  );
}
