"use client";

import { ConversationList } from "@/components/messages/conversation-list";
import { ChatArea } from "@/components/messages/chat-area";
import { EmptyState } from "@/components/messages/empty-state";
import { ChatProvider } from "@/components/messages/chat-context";
import { MessagesProvider } from "@/components/messages/messages-provider";
import { CryptoTrays } from "@/components/messages/trays/crypto-trays";
import { useActiveConversation } from "@/components/messages/messages-nav";

// Port of sidebar's (browse)/messages/page.tsx. The client-side session
// redirect was dropped — the (app) layout already guards server-side.
// Full-bleed: no card border/rounding — the split IS the page, list and
// chat divided by one full-height hairline. The active chat lives in ?c=
// (nuqs) so the header's MessagesNav can title itself with the username.

export default function MessagesPage() {
    const [selectedConversationId, setSelectedConversationId] = useActiveConversation();

    return (
        <ChatProvider>
            {/* Mobile: list fills the screen; opening a conversation swaps to a
                full-screen chat. Desktop keeps the 3/6 split.

                w-full, NOT w-screen. AppContainer centres every page inside
                max-w-(--app-max-width); 100vw ignores that cap, so this split
                ran the full viewport while every other route stopped at 1536px
                (it used to read "edge to edge" here, which was the bug). */}
            <div className="grid h-[calc(100svh-var(--header-height))] w-full grid-cols-1 overflow-hidden md:h-svh md:grid-cols-9">
                <div
                    className={`h-full md:col-span-3 md:block md:border-r md:border-flexwhite/10 md:pt-[var(--header-height)] ${selectedConversationId ? "hidden" : "block"}`}
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
