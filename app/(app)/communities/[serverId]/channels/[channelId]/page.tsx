"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useCommunityChannel } from "@/hooks/use-community-channel";
import { CommunityChatHeader } from "@/components/community/community-chat-header";
import { CommunityChatMessages } from "@/components/community/community-chat-messages";
import { CommunityChatInput } from "@/components/community/community-chat-input";
import { CommunityRulesGate } from "@/components/community/community-rules-gate";
import { CommunityAgeGate } from "@/components/community/community-age-gate";
import { CommunityChannelInfo } from "@/components/community/community-channel-info";
import { ChannelChatSkeleton } from "@/components/community/community-skeletons";

// Voice room pulls in the RealtimeKit SFU SDK — load it only when a voice
// channel is actually opened (the speed rule).
const VoiceRoom = dynamic(
    () => import("@/components/community/voice-room").then((m) => m.VoiceRoom),
    { ssr: false, loading: () => <ChannelChatSkeleton /> },
);

// A stable identity for the empty case. `useQuery({ ... }) = []` allocates a
// fresh array on every render while data is undefined, which propagates a new
// `emojiMap` down to every chat row and defeats their memo.
const NO_EXPRESSIONS: { id: string; kind: string; name: string; imageUrl: string }[] = [];

// Port of sidebar's (browse)/communities/[serverId]/channels/[channelId]/page.tsx.
export default function ChannelPage() {
    const params = useParams();
    const serverId = params?.serverId as string;
    const channelId = params?.channelId as string;

    const [infoOpen, setInfoOpen] = useState(false);

    const { data: session } = useAuthSession();
    const utils = trpc.useUtils();
    const { data: serverData, isLoading } = trpc.community.getServer.useQuery(
        { serverId },
        { enabled: !!serverId }
    );
    const { data: expressions = NO_EXPRESSIONS } = trpc.community.listExpressions.useQuery(
        { serverId },
        { enabled: !!serverId }
    );

    // Derived from `expressions`, memoized because they are PROPS to the chat
    // list and every row below it. Built inline in the render body they were a
    // new object/array on every keystroke, typing indicator, and presence tick
    // — one unstable prop is enough to defeat React.memo on every row.
    // Declared above the early returns below: hooks cannot run conditionally.
    const emojiMap = useMemo(
        () => Object.fromEntries(
            expressions.filter((e) => e.kind === "emoji").map((e) => [e.name, e.imageUrl]),
        ),
        [expressions],
    );
    const stickers = useMemo(
        () => expressions
            .filter((e) => e.kind === "sticker")
            .map((e) => ({ id: e.id, name: e.name, imageUrl: e.imageUrl })),
        [expressions],
    );

    const { onlineUserIds, typingUsers, sendTyping, sendStopTyping } = useCommunityChannel({
        channelId,
        serverId,
        onMessageChange: () => utils.community.getMessages.invalidate({ channelId }),
    });

    if (isLoading || !serverData || !session?.user) {
        return <ChannelChatSkeleton />;
    }

    const channel = serverData.channels.find((c) => c.id === channelId);
    if (!channel) {
        return (
            <div className="flex flex-1 items-center justify-center">
                <p className="text-zinc-400">Channel not found</p>
            </div>
        );
    }

    // AUDIO/VIDEO channels are voice rooms, not chat
    if (channel.type !== "TEXT") {
        return (
            <div className="relative flex h-full min-w-0 flex-col">
                <VoiceRoom
                    channelId={channelId}
                    channelName={channel.name}
                    channelType={channel.type}
                    serverId={serverId}
                    userName={session.user.name ?? "You"}
                />
                {serverData.server.ageRestricted && (
                    <CommunityAgeGate serverId={serverId} serverName={serverData.server.name} />
                )}
            </div>
        );
    }

    const canInvite = serverData.currentMember.role !== "GUEST";

    return (
        <div className="flex flex-col h-full min-w-0">
            <CommunityChatHeader
                channelName={channel.name}
                serverId={serverId}
                type="channel"
                channelId={channelId}
                onlineCount={onlineUserIds.length}
                onOpenInfo={() => setInfoOpen(true)}
            />

            <CommunityChatMessages
                channelId={channelId}
                channelName={channel.name}
                serverId={serverId}
                currentUserId={session.user.id}
                currentMemberRole={serverData.currentMember.role}
                typingUsers={typingUsers}
                emojiMap={emojiMap}
                blurMedia={!!serverData.server.blurMedia}
            />

            {serverData.server.rulesRequired && serverData.server.rules &&
             serverData.currentMember.role === "GUEST" && !serverData.currentMember.rulesAgreedAt ? (
                <CommunityRulesGate serverId={serverId} rules={serverData.server.rules} />
            ) : (
                <CommunityChatInput
                    channelId={channelId}
                    channelName={channel.name}
                    locked={!!channel.readOnly && serverData.currentMember.role === "GUEST"}
                    onTyping={sendTyping}
                    onStopTyping={sendStopTyping}
                    mentionables={serverData.members
                        .filter((m) => m.userUsername)
                        .map((m) => ({ username: m.userUsername!, name: m.userName }))}
                    stickers={stickers}
                />
            )}

            {serverData.server.ageRestricted && (
                <CommunityAgeGate serverId={serverId} serverName={serverData.server.name} />
            )}

            <CommunityChannelInfo
                open={infoOpen}
                onOpenChange={setInfoOpen}
                channelName={channel.name}
                channelType={channel.type}
                server={serverData.server}
                members={serverData.members}
                ownerId={serverData.server.ownerId}
                onlineUserIds={onlineUserIds}
                canInvite={canInvite}
            />
        </div>
    );
}
