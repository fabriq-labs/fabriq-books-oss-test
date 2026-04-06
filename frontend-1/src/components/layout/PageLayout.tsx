import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { Sidebar } from './Sidebar';
import TopBar from './TopBar';
import { useIsMobile } from '@/hooks/use-mobile';
import { useLocation } from 'react-router-dom';
import { useChat } from '@/contexts/ChatContext';
import { ChatUI } from '@/components/chat/ChatUI';

interface PageLayoutProps {
  children: React.ReactNode;
  title: string;
}

export const PageLayout: React.FC<PageLayoutProps> = ({ children, title }) => {
  const [collapsed, setCollapsed] = useState(false);
  const isMobile = useIsMobile();
  const location = useLocation();
  const { isChatOpen } = useChat();

  const isDashboard = location.pathname === '/';
  const showChatSidebar = !isDashboard && isChatOpen;

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar title={title} toggleSidebar={() => setCollapsed(!collapsed)} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar collapsed={isMobile ? true : collapsed} />
        <main
          className={cn(
            'transition-all duration-500 ease-in-out flex-1 overflow-auto p-4 md:p-6',
            isMobile ? 'ml-0' : (collapsed ? 'ml-[2.25rem]' : 'ml-[2.25rem]'),
            showChatSidebar ? 'mr-[30vw]' : ''
          )}
        >
          {children}
        </main>
        {/* Chat sidebar, only on non-dashboard routes */}
        {showChatSidebar && (
          <aside
            className="fixed right-0 top-16 bottom-0 z-40 h-[calc(100vh-4rem)] w-[30vw] max-w-[420px] bg-white border-l shadow-lg flex flex-col transition-transform duration-500 ease-in-out px-4 md:px-6"
            style={{ transform: showChatSidebar ? 'translateX(0)' : 'translateX(100%)' }}
          >
            <ChatUI sidebarMode={true} />
          </aside>
        )}
      </div>
    </div>
  );
};
