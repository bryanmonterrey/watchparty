import { ChatPanel } from "@/components/streaming/chat-panel";

// Pop-out chat: the rail's Chat tab, in its own window.
//
// Deliberately NOT the tabs — For you / Online / New belong to a rail beside a
// player, and this window has no player next to it. Same ChatPanel component
// either way, so the two can't drift.

export default async function PopoutChatPage({
    params,
}: {
    params: Promise<{ userId: string }>;
}) {
    const { userId } = await params;

    return (
        <main className="flex min-h-0 flex-1 flex-col px-2 pb-2 pt-3">
            <ChatPanel hostUserId={userId} />
        </main>
    );
}
