"use client";

import { useRef, Fragment } from "react";
import { ServerCrash } from "lucide-react";
import { format } from "date-fns";
import { trpc } from "@/lib/trpc/client";
import { useCommunityScroll } from "@/hooks/use-community-scroll";
import { useEffect } from "react";
import { CommunityChatItem } from "./community-chat-item";
import { CommunityChatWelcome } from "./community-chat-welcome";

const DATE_FORMAT = "d MMM yyyy, HH:mm";

type TypingUser = { userId: string; userName: string };

type Props = {
    channelId: string;
    channelName: string;
    serverId: string;
    currentUserId: string;
    currentMemberRole: string;
    typingUsers?: TypingUser[];
};

function typingLabel(users: TypingUser[]) {
    const names = users.map((u) => u.userName);
    if (names.length === 1) return `${names[0]} is typing`;
    if (names.length === 2) return `${names[0]} and ${names[1]} are typing`;
    if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]} are typing`;
    return "Several people are typing";
}

export function CommunityChatMessages({
    channelId,
    channelName,
    serverId,
    currentUserId,
    currentMemberRole,
    typingUsers = [],
}: Props) {
    const chatRef = useRef<HTMLDivElement>(null);
    const bottomRef = useRef<HTMLDivElement>(null);

    const {
        data,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        status,
    } = trpc.community.getMessages.useInfiniteQuery(
        { channelId, limit: 50 },
        {
            getNextPageParam: (lastPage) => lastPage.nextCursor,
        }
    );

    const allMessages = data?.pages?.flatMap((page) => page.items) ?? [];

    useCommunityScroll({
        chatRef,
        bottomRef,
        loadMore: fetchNextPage,
        shouldLoadMore: !isFetchingNextPage && !!hasNextPage,
        count: allMessages.length,
    });

    // Read marker: viewing a channel marks it read — on open and whenever a
    // new message lands while you're looking at it.
    const utils = trpc.useUtils();
    const markRead = trpc.community.markChannelRead.useMutation({
        onSuccess: () => {
            utils.community.getServer.invalidate({ serverId });
            utils.community.listServers.invalidate();
        },
    });
    const markReadMutate = markRead.mutate;
    const newestId = data?.pages?.[0]?.items?.[0]?.id;
    useEffect(() => {
        if (channelId) markReadMutate({ channelId });
    }, [channelId, newestId, markReadMutate]);

    if (status === "pending") {
        return (
            <div className="flex flex-col flex-1 justify-end gap-5 p-4 overflow-hidden">
                {Array.from({ length: 7 }).map((_, i) => (
                    <div key={i} className="flex gap-x-3">
                        <div className="size-9 shrink-0 overflow-hidden rounded-full"><div className="size-full shimmer-skeleton" /></div>
                        <div className="flex w-full flex-col gap-2">
                            <div className="h-3.5 w-24 overflow-hidden rounded-full"><div className="size-full shimmer-skeleton" /></div>
                            <div className={`h-3.5 overflow-hidden rounded-full ${i % 3 === 0 ? "w-2/3" : i % 3 === 1 ? "w-1/2" : "w-3/4"}`}><div className="size-full shimmer-skeleton" /></div>
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    if (status === "error") {
        return (
            <div className="flex flex-col flex-1 justify-center items-center">
                <ServerCrash className="h-7 w-7 text-zinc-500 my-4" />
                <p className="text-xs text-zinc-400">Something went wrong!</p>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col min-h-0">
        <div ref={chatRef} className="flex-1 flex flex-col py-4 overflow-y-auto">
            {!hasNextPage && <div className="flex-1" aria-hidden />}
            {!hasNextPage && <CommunityChatWelcome type="channel" name={channelName} />}

            {hasNextPage && (
                <div className="flex justify-center">
                    {isFetchingNextPage ? (
                        <div className="my-4 h-3.5 w-40 overflow-hidden rounded-full"><div className="size-full shimmer-skeleton" /></div>
                    ) : (
                        <button
                            onClick={() => fetchNextPage()}
                            className="text-zinc-400 hover:text-zinc-300 text-sm my-4 transition"
                        >
                            Load previous messages
                        </button>
                    )}
                </div>
            )}

            <div className="flex flex-col-reverse mt-auto">
                {data?.pages?.map((group, i) => (
                    <Fragment key={i}>
                        {group.items.map((message) => (
                            <CommunityChatItem
                                key={message.id}
                                id={message.id}
                                content={message.content}
                                memberRole={message.memberRole}
                                userName={message.userName}
                                userImage={message.userImage}
                                userId={message.userId}
                                currentUserId={currentUserId}
                                currentMemberRole={currentMemberRole}
                                timestamp={format(new Date(message.createdAt), DATE_FORMAT)}
                                fileUrl={message.fileUrl}
                                deleted={message.deleted}
                                isUpdated={message.updatedAt.getTime() !== message.createdAt.getTime()}
                                serverId={serverId}
                                pinned={message.pinned}
                                replyTo={message.replyToId ? {
                                    userName: message.replyUserName,
                                    content: message.replyContent ?? "message deleted",
                                    deleted: message.replyDeleted ?? true,
                                } : null}
                            />
                        ))}
                    </Fragment>
                ))}
            </div>

            <div ref={bottomRef} aria-hidden />
        </div>

        <div className="h-6 px-4 shrink-0">
            {typingUsers.length > 0 && (
                <div className="flex items-center gap-x-2 text-xs text-flexwhite/50">
                    <span className="flex gap-x-0.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-twitter animate-bounce [animation-delay:-0.3s]" />
                        <span className="h-1.5 w-1.5 rounded-full bg-twitter animate-bounce [animation-delay:-0.15s]" />
                        <span className="h-1.5 w-1.5 rounded-full bg-twitter animate-bounce" />
                    </span>
                    <span><span className="font-semibold text-flexwhite/80">{typingLabel(typingUsers)}</span>…</span>
                </div>
            )}
        </div>
        </div>
    );
}
