import React, { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { AgentSessionProvider, useAgentSession } from '@/contexts/AgentSessionContext';
import { SessionsSidebar } from '@/components/workbench/SessionsSidebar';

const WorkbenchInner: React.FC = () => {
  const { refreshSessions } = useAgentSession();

  useEffect(() => {
    void refreshSessions();
  }, [refreshSessions]);

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-white">
      <SessionsSidebar />
      <div className="flex-1 min-w-0 overflow-hidden">
        <Outlet />
      </div>
    </div>
  );
};

const WorkbenchPage: React.FC = () => (
  <AgentSessionProvider>
    <WorkbenchInner />
  </AgentSessionProvider>
);

export default WorkbenchPage;
