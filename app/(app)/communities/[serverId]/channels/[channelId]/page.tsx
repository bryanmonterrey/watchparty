"use client";

import { useState } from "react";
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
    const { data: expressions = [] } = trpc.community.listExpressions.useQuery(
        { serverId },
        { enabled: !!serverId }
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

    const canInvite = serverData.currentMember.role !== "GUEST";
    const emojiMap = Object.fromEntries(
        expressions.filter((e) => e.kind === "emoji").map((e) => [e.name, e.imageUrl]),
    );
    const stickers = expressions
        .filter((e) => e.kind === "sticker")
        .map((e) => ({ id: e.id, name: e.name, imageUrl: e.imageUrl }));

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
