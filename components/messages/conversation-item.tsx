'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

import { useState, useEffect } from 'react';
import { useEncryption } from '@/hooks/use-encryption';

interface Conversation {
    id: string;
    participantName: string;
    participantAvatar?: string;
    lastMessageTime: string;
    unreadCount: number;
    isOnline: boolean;
    // Raw message data
    lastMessageAt?: Date | string | null;
    lastMessageSenderId?: string | null;
    lastMessageContent?: string | null;
    lastMessageType?: string | null;
    lastMessageIsEncrypted?: boolean | null;
    lastMessageIv?: string | null;
    lastMessageSenderPublicKey?: string | null;
    otherParticipantPublicKey?: string | null;
    lastReactionAt?: Date | string | null;
    lastReactionSenderId?: string | null;
}

interface ConversationItemProps {
    conversation: Conversation;
    isSelected: boolean;
    onClick: () => void;
}

export function ConversationItem({
    conversation,
    isSelected,
    onClick,
    currentUserId,
}: ConversationItemProps & { currentUserId?: string }) {
    const { decryptMessage, isInitialized } = useEncryption();
    const [decryptedContent, setDecryptedContent] = useState<string | null>(null);

    const isMe = conversation.lastMessageSenderId === currentUserId;

    useEffect(() => {
        if (
            isInitialized &&
            conversation.lastMessageIsEncrypted &&
            conversation.lastMessageContent &&
            conversation.lastMessageIv &&
            !decryptedContent
        ) {
            // If I sent it, I need the other person's key. If they sent it, I need their key.
            // Luckily the router provides both appropriately or we can deduce.
            // If isMe, we use otherParticipantPublicKey.
            // If !isMe, we use lastMessageSenderPublicKey.
            // Note: Router provides named keys now.

            const keyToUse = isMe
                ? conversation.otherParticipantPublicKey
                : conversation.lastMessageSenderPublicKey;



            if (keyToUse) {
                decryptMessage(conversation.lastMessageContent, conversation.lastMessageIv, keyToUse)
                    .then(text => setDecryptedContent(text))
                    .catch(err => {
                        console.error('Preview decryption failed', err);
                        setDecryptedContent('Unable to decrypt');
                    });
            }
        }
    }, [conversation, isMe, decryptMessage, decryptedContent, isInitialized]);

    // Format the preview
    const getPreviewText = () => {
        const msgTime = conversation.lastMessageAt ? new Date(conversation.lastMessageAt).getTime() : 0;
        const reactionTime = conversation.lastReactionAt ? new Date(conversation.lastReactionAt).getTime() : 0;

        if (reactionTime > msgTime) {
            return conversation.lastReactionSenderId === currentUserId ? 'You: Liked a message' : 'Liked a message';
        }

        if (!conversation.lastMessageAt) return 'Start a conversation';

        const prefix = isMe ? 'You: ' : '';
        let content = 'Sent a message';

        if (conversation.lastMessageType === 'image' || conversation.lastMessageType === 'file') {
            content = 'Sent an attachment';
        } else if (conversation.lastMessageType === 'transaction_send') {
            content = isMe ? 'Sent crypto' : 'Received crypto';
        } else if (conversation.lastMessageType === 'transaction_request') {
            content = isMe ? 'Requested crypto' : 'Request for crypto';
        } else if (decryptedContent) {
            content = decryptedContent;
        } else if (conversation.lastMessageContent) {
            if (conversation.lastMessageIsEncrypted) {
                content = 'Sent a message'; // Still decrypting or failed
            } else {
                content = conversation.lastMessageContent;
            }
        }

        return `${prefix}${content}`;
    };

    return (
        <button
            onClick={onClick}
            className={cn(
                'w-full cursor-pointer flex items-center border-none gap-3 px-4 py-2 hover:bg-zinc-800/50 duration-200  ease-in-out transition-colors text-left',
                isSelected && 'bg-zinc-800/30'
            )}
        >
            {/* Avatar with online indicator */}
            <div className="relative flex-shrink-0">
                <Avatar className="h-14 w-14">
                    <AvatarImage src={conversation.participantAvatar} />
                    <AvatarFallback className="bg-zinc-700 text-white">
                    </AvatarFallback>
                </Avatar>
                {conversation.isOnline && (
                    <div className="absolute bottom-0 right-0 h-4 w-4 rounded-full bg-green-500" />
                )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                    <span className="font-extrabold text-sm text-white truncate">
                        {conversation.participantName}
                    </span>
                    {conversation.unreadCount > 0 && (
                        <Badge
                            variant="default"
                            className="bg-[#0095f6] hover:bg-[#0095f6] h-5 min-w-5 rounded-full px-1.5 text-xs flex-shrink-0"
                        >
                            {conversation.unreadCount}
                        </Badge>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <p className="text-sm text-white/60 truncate flex-1">
                        {getPreviewText()}
                        {conversation.lastMessageTime && (
                            <>
                                <span className="mx-1.5">•</span>
                                {conversation.lastMessageTime}
                            </>
                        )}
                    </p>
                </div>
            </div>
        </button>
    );
}
