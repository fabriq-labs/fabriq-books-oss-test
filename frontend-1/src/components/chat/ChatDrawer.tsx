import React from 'react';
import { Drawer, DrawerPortal, DrawerOverlay } from '@/components/ui/drawer';
import { useChat } from '@/contexts/ChatContext';
import { ChatShell } from './ChatShell';
import { cn } from '@/lib/utils';

export const ChatDrawer: React.FC = () => {
    const { isChatOpen, toggleChat } = useChat();

    return (
        <Drawer open={isChatOpen} onOpenChange={toggleChat}>
            <DrawerPortal>
                <DrawerOverlay />
                <div
                    className={cn(
                        'fixed top-0 right-0 bottom-0 z-[100] h-full bg-white border-l shadow-lg transition-transform duration-500 ease-in-out',
                        'w-[min(96vw,920px)]',
                        isChatOpen ? 'translate-x-0' : 'translate-x-full'
                    )}
                    style={{ borderRadius: 0 }}
                >
                    <ChatShell className="h-full" />
                </div>
            </DrawerPortal>
        </Drawer>
    );
};
