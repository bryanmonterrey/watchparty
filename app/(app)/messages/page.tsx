"use client";

import { useState } from "react";
import { ConversationList } from "@/components/messages/conversation-list";
import { ChatArea } from "@/components/messages/chat-area";
import { EmptyState } from "@/components/messages/empty-state";
import { ChatProvider } from "@/components/messages/chat-context";
import { MessagesProvider } from "@/components/messages/messages-provider";
import { CryptoTrays } from "@/components/messages/trays/crypto-trays";

// Port of sidebar's (browse)/messages/page.tsx. The client-side session
// redirect was dropped — the (app) layout already guards server-side.

export default function MessagesPage() {
    const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);

    return (
        <ChatProvider>
            {/* Mobile (per "Messages page mobile landing.svg"): list fills the
                screen; opening a conversation swaps to a full-screen chat. The
                desktop split keeps sidebar's 3/6 grid. */}
            <div className="grid h-[calc(100svh-var(--header-height))] md:h-[calc(100svh-var(--header-height)-1rem)] md:mt-header md:rounded-3xl md:border md:border-flexwhite/10 w-full md:w-[calc(100vw-32px)] mx-auto grid-cols-1 overflow-hidden md:grid-cols-9 bg-zinc-950/10 backdrop-blur-md pb-4">
                <div
                    className={`h-full shadow-sm md:col-span-3 md:block md:border-r md:border-flexwhite/10 ${selectedConversationId ? "hidden" : "block"}`}
                >
                    <ConversationList
                        selectedConversationId={selectedConversationId}
                        onSelectConversation={setSelectedConversationId}
                    />
                </div>

                <div
                    className={`h-full min-h-0 md:col-span-6 md:block ${selectedConversationId ? "block" : "hidden"}`}
                >
                    {selectedConversationId ? (
                        <MessagesProvider conversationId={selectedConversationId}>
                            <div className="flex h-full flex-col">
                                <button
                                    onClick={() => setSelectedConversationId(null)}
                                    className="px-4 py-2 text-left text-sm font-semibold text-zinc-400 md:hidden"
                                >
                                    ‹ Back
                                </button>
                                <div className="min-h-0 flex-1">
                                    <ChatArea conversationId={selectedConversationId} />
                                </div>
                            </div>
                        </MessagesProvider>
                    ) : (
                        <EmptyState />
                    )}
                </div>
            </div>
            <CryptoTrays />
        </ChatProvider>
    );
}
