"use client";

'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';
import { Skeleton } from 'boneyard-js/react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc/client';
import { useCreateConversation } from '@/hooks/use-conversations';

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
    const { data, isLoading } = trpc.user.search.useQuery(
        { query: searchQuery, limit: 10 },
        { enabled: searchQuery.length > 0 }
    );
    const { createConversation, isCreating } = useCreateConversation();

    const handleSelectUser = async (userId: string) => {
        try {
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
                    },
                }
            );
        } catch (error) {
            console.error('Failed to create conversation:', error);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>New Message</DialogTitle>
                    <DialogDescription>
                        Search for a user to start a conversation
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    {/* Search Input */}
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                        <Input
                            placeholder="Search users..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10"
                        />
                    </div>

                    {/* User List */}
                    <div className="max-h-[300px] overflow-y-auto space-y-2">
                        {!isLoading && searchQuery && data?.users.length === 0 && (
                            <div className="text-center py-8 text-white/60 text-sm">
                                No users found
                            </div>
                        )}

                        {!isLoading && !searchQuery && (
                            <div className="text-center py-8 text-white/60 text-sm">
                                Start typing to search for users
                            </div>
                        )}

                        <Skeleton
                            name="new-conv-users"
                            loading={isLoading}
                        >
                            <>
                                {(data?.users || []).map((user: { id: string; name: string; username: string | null; email: string; avatar_url: string | null }) => (
                                    <Button
                                        key={user.id}
                                        variant="ghost"
                                        className="w-full justify-start h-auto p-3 hover:bg-zinc-800/50"
                                        onClick={() => handleSelectUser(user.id)}
                                        disabled={isCreating}
                                    >
                                        <Avatar className="h-10 w-10 mr-3">
                                            <AvatarImage src={user.avatar_url || undefined} alt={user.name} />
                                            <AvatarFallback>
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1 text-left">
                                            <div className="font-medium">{user.name}</div>
                                            <div className="text-sm text-white/60">@{user.username || user.email}</div>
                                        </div>
                                    </Button>
                                ))}
                            </>
                        </Skeleton>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
