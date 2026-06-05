'use client';

import { ChatHeader } from './chat-header';
import { MessageList } from './message-list';
import { MessageInput } from './message-input';

interface ChatAreaProps {
    conversationId: string;
}

export function ChatArea({ conversationId }: ChatAreaProps) {
    return (
        <div className="flex h-full flex-col">
            {/* Header */}
            <ChatHeader conversationId={conversationId} />

            {/* Messages */}
            <MessageList conversationId={conversationId} />

            {/* Input */}
            <MessageInput conversationId={conversationId} />
        </div>
    );
}
