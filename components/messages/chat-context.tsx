'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';

interface ReplyMessage {
    id: string;
    content: string;
    senderId: string;
    senderName?: string;
    messageType?: string;
    attachmentUrl?: string | null;
}

interface ChatContextType {
    // Attachment Logic
    attachment: File | null;
    setAttachment: (file: File | null) => void;
    triggerAttach: () => void; // Signal to open file picker (if needed, or handled locally in sidebar)

    // Recipient Context for Actions
    activeRecipient: { id: string; name: string; image?: string; walletAddress?: string; conversationId: string } | null;
    setActiveRecipient: (recipient: { id: string; name: string; image?: string; walletAddress?: string; conversationId: string } | null) => void;

    // Reply Context
    replyToMessage: ReplyMessage | null;
    setReplyToMessage: (message: ReplyMessage | null) => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({ children }: { children: React.ReactNode }) {
    const [attachment, setAttachment] = useState<File | null>(null);
    const [activeRecipient, setActiveRecipient] = useState<{ id: string; name: string; image?: string; walletAddress?: string; conversationId: string } | null>(null);
    const [replyToMessage, setReplyToMessage] = useState<ReplyMessage | null>(null);

    // We can expose a ref-based trigger if we wanted the file input to live in MessageInput,
    // but distinct "Attach" button implies file input can live in Sidebar and just pass data to Context.
    const triggerAttach = useCallback(() => {
        // Placeholder if we need to trigger something in MessageInput
    }, []);

    return (
        <ChatContext.Provider
            value={{
                attachment,
                setAttachment,
                triggerAttach,
                activeRecipient,
                setActiveRecipient,
                replyToMessage,
                setReplyToMessage,
            }}
        >
            {children}
        </ChatContext.Provider>
    );
}

export function useChat() {
    const context = useContext(ChatContext);
    if (context === undefined) {
        throw new Error('useChat must be used within a ChatProvider');
    }
    return context;
}
