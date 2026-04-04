import React from 'react';
import { Drawer, DrawerPortal, DrawerOverlay } from '@/components/ui/drawer';
import { useChat } from '@/contexts/ChatContext';
import { ChatUI } from './ChatUI';

export const ChatDrawer: React.FC = () => {
    const { isChatOpen, toggleChat } = useChat();

    return (
        <Drawer open={isChatOpen} onOpenChange={toggleChat}>
            <DrawerPortal>
                <DrawerOverlay />
                <div
                    className={`fixed top-0 right-0 bottom-0 z-[100] h-full w-[30vw] max-w-[420px] bg-white border-l shadow-lg flex flex-col transition-transform duration-500 ease-in-out ${isChatOpen ? 'translate-x-0' : 'translate-x-full'}`}
                    style={{ borderRadius: 0 }}
                >
                    <ChatUI />
                </div>
            </DrawerPortal>
        </Drawer>
    );
}; 