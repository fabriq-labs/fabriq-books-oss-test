import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useChat } from '@/contexts/ChatContext';
import { useTool } from '@/contexts/ToolContext';

/** Reset chat on login/logout so the dashboard and empty chat state are shown by default. */
export const ChatAuthSync: React.FC = () => {
  const { user } = useAuth();
  const { resetChat } = useChat();
  const { clearToolData } = useTool();
  const prevUserId = useRef<string | null>(null);

  useEffect(() => {
    const userId = user?.id ?? null;
    if (userId !== prevUserId.current) {
      resetChat();
      clearToolData();
    }
    prevUserId.current = userId;
  }, [user?.id, resetChat, clearToolData]);

  return null;
};
