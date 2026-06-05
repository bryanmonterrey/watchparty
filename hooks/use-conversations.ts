'use client';

import { trpc } from '@/lib/trpc/client';
import { useEffect } from 'react';

import { inferRouterOutputs } from '@trpc/server';
import { AppRouter } from '@/server/routers';

// Fallback manual type if inference fails
export interface Conversation {
    id: string;
    createdAt: Date;
    updatedAt: Date | null;
    lastMessageAt: Date | null;
    isGroup: boolean;
    groupName: string | null;
    groupAvatar: string | null;
    otherParticipantId: string | null;
    otherParticipantName: string | null;
    otherParticipantAvatar: string | null;
    otherParticipantWalletAddress: string | null;
    lastMessageContent: string | null;
    lastMessageSenderId: string | null;
    lastMessageType: string | null;
    lastMessageIsEncrypted: boolean | null;
    lastMessageIv: string | null;
    lastMessageSenderPublicKey: string | null;

    otherParticipantPublicKey: string | null;
    lastReactionAt: Date | string | null;
    lastReactionSenderId: string | null;
}

/**
 * Hook for managing conversations with real-time updates
 */
export function useConversations() {
    const utils = trpc.useUtils();

    // Fetch conversations
    const { data, isLoading, error } = trpc.conversation.list.useQuery();

    // Note: detailed real-time updates for *new* conversations from others 
    // would require a user-channel subscription. 
    // For now, the list updates when WE send a message (via invalidation).

    return {
        conversations: data?.conversations || ([] as Conversation[]),
        isLoading,
        error,
    };
}

/**
 * Hook for creating a new conversation
 */
export function useCreateConversation() {
    const utils = trpc.useUtils();

    const mutation = trpc.conversation.create.useMutation({
        onSuccess: () => {
            // Invalidate conversations list
            utils.conversation.list.invalidate();
        },
    });

    return {
        createConversation: mutation.mutate,
        isCreating: mutation.isPending,
        error: mutation.error,
    };
}

/**
 * Hook for marking conversation as read
 */
export function useMarkAsRead() {
    const mutation = trpc.conversation.markAsRead.useMutation();

    return {
        markAsRead: mutation.mutate,
        isMarking: mutation.isPending,
    };
}
