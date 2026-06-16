import React from 'react';
import { Fingerprint } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { User } from '@/models/User';

interface ChatUserMessageLayoutProps {
    children: React.ReactNode;
    userName?: string;
    userImage?: string;
    userInitials?: string;
    className?: string;
}

interface ChatAssistantMessageLayoutProps {
    children: React.ReactNode;
    className?: string;
}

/** Assistant avatar — brand primary colour. */
export const ChatAssistantAvatar: React.FC<{ className?: string }> = ({ className }) => (
    <div
        className={cn(
            'shrink-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center shadow-sm',
            className
        )}
        aria-label="AI assistant"
        title="AI assistant"
    >
        <Fingerprint className="w-4 h-4 text-primary-foreground" strokeWidth={2.25} />
    </div>
);

export const ChatUserMessageLayout: React.FC<ChatUserMessageLayoutProps> = ({
    children,
    userName = 'You',
    userImage,
    userInitials = 'U',
    className,
}) => (
    <div className={cn('flex flex-col items-end max-w-[95%] w-full', className)}>
        <div className="rounded-2xl px-5 py-3 text-[15px] leading-relaxed bg-primary text-primary-foreground shadow-sm">
            {children}
        </div>
        <div className="flex items-center gap-2 mt-2 pr-0.5">
            <span className="text-xs font-medium text-foreground">{userName}</span>
            <Avatar className="h-7 w-7 border border-border">
                <AvatarImage src={userImage || ''} alt={userName} />
                <AvatarFallback className="bg-primary text-primary-foreground text-[11px] font-semibold">
                    {userInitials}
                </AvatarFallback>
            </Avatar>
        </div>
    </div>
);

export const ChatAssistantMessageLayout: React.FC<ChatAssistantMessageLayoutProps> = ({
    children,
    className,
}) => (
    <div className={cn('flex items-start gap-3 max-w-[95%] w-full', className)}>
        <ChatAssistantAvatar className="mt-1" />
        <div className="flex-1 min-w-0 pt-0.5">{children}</div>
    </div>
);

export function getUserImageUrl(user: User | null | undefined): string | undefined {
    return (user as User & { image?: string })?.image || undefined;
}
