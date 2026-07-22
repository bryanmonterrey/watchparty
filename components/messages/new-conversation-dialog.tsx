'use client';

import { useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Search01Icon } from '@hugeicons/core-free-icons';
import {
    Dialog,
    DialogContent,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { trpc } from '@/lib/trpc/client';
import { useCreateConversation } from '@/hooks/use-conversations';
import { cn } from '@/lib/utils';

interface NewConversationDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConversationCreated: (conversationId: string) => void;
}

export function NewConversationDialog({
    open,
    onOpenChange,
    onConversationCreated,
}: NewConversationDialogProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [pendingId, setPendingId] = useState<string | null>(null);
    const { data, isLoading } = trpc.user.search.useQuery(
        { query: searchQuery, limit: 10 },
        { enabled: searchQuery.length > 0 }
    );
    const { createConversation, isCreating } = useCreateConversation();

    const handleSelectUser = (userId: string) => {
        setPendingId(userId);
        createConversation(
            {
                participantIds: [userId],
                isGroup: false,
            },
            {
                onSuccess: (data) => {
                    onConversationCreated(data.conversation.id);
                    onOpenChange(false);
                    setSearchQuery('');
                    setPendingId(null);
                },
                onError: () => setPendingId(null),
            }
        );
    };

    return (
        <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setSearchQuery(''); }}>
            <DialogContent className="gap-4 rounded-4xl border-none p-6 sm:max-w-[440px]" showCloseButton={false}>
                <DialogTitle className="text-center text-[18px] font-bold tracking-tight text-white">New message</DialogTitle>

                {/* Search */}
                <div className="relative">
                    <HugeiconsIcon icon={Search01Icon} className="pointer-events-none absolute left-4 top-1/2 z-10 size-4 -translate-y-1/2 text-zinc-500" strokeWidth={2} />
                    <Input
                        radius={16}
                        placeholder="Search people"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        autoFocus
                        className="h-[52px] pl-11 text-[16px]"
                    />
                </div>

                {/* Results — fixed height so the dialog doesn't jump while typing */}
                <div className="h-[300px] space-y-0.5 overflow-y-auto hidden-scrollbar">
                    {isLoading && (
                        <div className="flex flex-col gap-2 pt-1">
                            {Array.from({ length: 4 }).map((_, i) => (
                                <div key={i} className="flex items-center gap-3 px-2 py-2">
                                    <div className="size-10 overflow-hidden rounded-full"><div className="size-full shimmer-skeleton" /></div>
                                    <div className="flex-1 space-y-1.5">
                                        <div className="h-3.5 w-1/3 overflow-hidden rounded-full"><div className="size-full shimmer-skeleton" /></div>
                                        <div className="h-2.5 w-1/4 overflow-hidden rounded-full"><div className="size-full shimmer-skeleton" /></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {!isLoading && searchQuery && data?.users.length === 0 && (
                        <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
                            <p className="text-[14px] font-bold text-zinc-400">No one found</p>
                            <p className="text-[12px] font-medium text-zinc-600">Try a different name or @username</p>
                        </div>
                    )}

                    {!isLoading && !searchQuery && (
                        <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
                            <p className="text-[14px] font-bold text-zinc-400">Message someone</p>
                            <p className="text-[12px] font-medium text-zinc-600">Search by name or @username to start a chat</p>
                        </div>
                    )}

                    {!isLoading && (data?.users || []).map((user: { id: string; name: string; username: string | null; email: string; avatar_url: string | null }) => {
                        const isPending = pendingId === user.id;
                        return (
                            <button
                                key={user.id}
                                onClick={() => handleSelectUser(user.id)}
                                disabled={isCreating}
                                className={cn(
                                    "flex w-full cursor-pointer items-center gap-3 rounded-[18px] px-2.5 py-2 text-left transition-colors",
                                    "hover:bg-white/[0.04] active:bg-white/[0.06] disabled:pointer-events-none",
                                    isCreating && !isPending && "opacity-40",
                                )}
                            >
                                <Avatar className="size-10 shrink-0">
                                    <AvatarImage src={user.avatar_url || undefined} alt={user.name} />
                                    <AvatarFallback className="bg-white/10 text-[13px] font-bold text-zinc-300">
                                        {(user.name || "?")[0]?.toUpperCase()}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-[14px] font-bold text-white">{user.name}</p>
                                    <p className="truncate text-[12px] font-medium text-zinc-500">@{user.username || user.email}</p>
                                </div>
                                {isPending && (
                                    <span className="size-4 shrink-0 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                                )}
                            </button>
                        );
                    })}
                </div>
            </DialogContent>
        </Dialog>
    );
}
