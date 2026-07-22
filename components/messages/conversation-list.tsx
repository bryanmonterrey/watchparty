"use client";

'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConversationItem } from './conversation-item';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useConversations } from '@/hooks/use-conversations';
import { useChat } from './chat-context';

import { NewConversationDialog } from './new-conversation-dialog';
import { SearchIcon, NewMessageIcon } from '@/components/icons';
import { useAuthSession } from '@/hooks/use-auth-session';
import { formatRelativeTime } from '@/lib/date-utils';

interface ConversationListProps {
    selectedConversationId: string | null;
    onSelectConversation: (id: string) => void;
}

export function ConversationList({
    selectedConversationId,
    onSelectConversation,
}: ConversationListProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState<'messages' | 'requests'>('messages');
    const [showNewConversation, setShowNewConversation] = useState(false);

    const { conversations, isLoading } = useConversations();
    const { setActiveRecipient } = useChat();
    const { data: session } = useAuthSession();

    const filteredConversations = conversations.filter(conv => {
        if (!searchQuery) return true;
        const name = conv.groupName || conv.otherParticipantName || 'You';
        return name.toLowerCase().includes(searchQuery.toLowerCase());
    });



    return (
        <>
            <div className="flex h-full flex-col overflow-hidden">
                

                {/* Search + new message */}
                <div className="px-4 py-2 flex-shrink-0 flex items-center justify-between gap-4">
                    <div className="relative flex h-[52px] flex-1 items-center bg-zinc-500/30 hover:bg-zinc-500/60 rounded-full focus-within:border-zinc-700 transition-colors">
                        <SearchIcon className="absolute left-4 w-[20px] h-[20px] text-zinc-400 pointer-events-none" />
                        <input
                            type="text"
                            placeholder="Search"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-transparent pl-11 pr-4 text-[16px] font-medium text-white placeholder:text-zinc-500 focus:outline-none"
                        />
                    </div>
                    <div className="flex flex-col items-center justify-center flex-shrink-0">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="flex-shrink-0"
                        onClick={() => setShowNewConversation(true)}
                    >
                        <NewMessageIcon className="size-7 text-white/80 hover:text-white/85" width={24} height={24} />
                    </Button>
                    </div>
                </div>

                {/* Conversation List */}
                <div className="flex-1 min-h-0 mt-2">
                    <ScrollArea className="h-full">
                        {filteredConversations.length === 0 && !isLoading ? (
                            <div className="flex flex-col items-center justify-center h-full text-center p-6">
                                <p className="text-white/60 text-sm">No conversations yet</p>
                                <p className="text-white/40 text-xs mt-1">Click the edit icon to start a new chat</p>
                            </div>
                        ) : isLoading ? (
                            <div className="">
                                {Array.from({ length: 8 }).map((_, i) => (
                                    <div key={i} className="flex items-center gap-3 px-4 py-2">
                                        <div className="size-14 rounded-full shimmer-skeleton shrink-0" />
                                        <div className="flex-1 space-y-2">
                                            <div className="shimmer-skeleton h-3.5 w-32 rounded-full" />
                                            <div className="shimmer-skeleton h-3 w-48 rounded-full" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="">
                                {filteredConversations.map((conversation) => (
                                    <ConversationItem
                                        key={conversation.id}
                                        currentUserId={session?.user?.id}
                                        conversation={{
                                            id: conversation.id,
                                            participantName: conversation.groupName || conversation.otherParticipantName || 'You',
                                            participantAvatar: (conversation.groupAvatar || conversation.otherParticipantAvatar) || undefined,
                                            lastMessageTime: (conversation.lastReactionAt && new Date(conversation.lastReactionAt) > new Date(conversation.lastMessageAt || 0))
                                                ? formatRelativeTime(new Date(conversation.lastReactionAt).toISOString())
                                                : (conversation.lastMessageAt || conversation.createdAt)
                                                    ? formatRelativeTime(new Date(conversation.lastMessageAt || conversation.createdAt).toISOString())
                                                    : '',
                                            unreadCount: 0,
                                            isOnline: false,
                                            // Pass raw data for decryption in item
                                            lastMessageAt: conversation.lastMessageAt,
                                            lastMessageSenderId: conversation.lastMessageSenderId,
                                            lastMessageContent: conversation.lastMessageContent,
                                            lastMessageType: conversation.lastMessageType,
                                            lastMessageIsEncrypted: conversation.lastMessageIsEncrypted,
                                            lastMessageIv: conversation.lastMessageIv,
                                            lastMessageSenderPublicKey: conversation.lastMessageSenderPublicKey,
                                            otherParticipantPublicKey: conversation.otherParticipantPublicKey,
                                            lastReactionAt: conversation.lastReactionAt,
                                            lastReactionSenderId: conversation.lastReactionSenderId,
                                        }}
                                        isSelected={selectedConversationId === conversation.id}
                                        onClick={() => {
                                            if (!conversation.isGroup && conversation.otherParticipantId && conversation.otherParticipantName) {
                                                setActiveRecipient({
                                                    id: conversation.otherParticipantId,
                                                    name: conversation.otherParticipantName,
                                                    image: conversation.otherParticipantAvatar || undefined,
                                                    walletAddress: conversation.otherParticipantWalletAddress || undefined,
                                                    conversationId: conversation.id
                                                });
                                            } else {
                                                setActiveRecipient(null);
                                            }
                                            onSelectConversation(conversation.id);
                                        }}
                                    />
                                ))}
                            </div>
                        )}
                    </ScrollArea>
                </div>
            </div>

            <NewConversationDialog
                open={showNewConversation}
                onOpenChange={setShowNewConversation}
                onConversationCreated={onSelectConversation}
            />
        </>
    );
}
