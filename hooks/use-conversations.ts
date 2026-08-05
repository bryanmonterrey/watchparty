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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Hook for managing conversations with real-time updates.
 *
 * `activeConversationId` is the chat currently open. The server lists only
 * threads with messages (empty ones are leftovers, not conversations) — passing
 * the open one keeps a chat you just started in the list until you send.
 */
export function useConversations(activeConversationId?: string | null) {
    const utils = trpc.useUtils();

    // The active id comes from ?c=, which anyone can hand-edit. The procedure
    // takes a uuid, so pass one or pass nothing — a junk param must not fail
    // the input and blank the whole list.
    const activeId = activeConversationId && UUID_RE.test(activeConversationId)
        ? activeConversationId
        : undefined;

    // Fetch conversations
    const { data, isLoading, error } = trpc.conversation.list.useQuery(
        { activeConversationId: activeId },
        // The active id is part of the key, so switching chats starts a fresh
        // fetch — hold the previous list rather than flashing the skeleton.
        { placeholderData: (prev) => prev },
    );

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
