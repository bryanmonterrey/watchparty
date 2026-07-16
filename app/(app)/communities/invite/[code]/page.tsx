"use client";

import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ServerProfileCard } from "@/components/community/server-profile-card";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

// Invite landing — where copied invite links point. Shows the server's
// profile card (or the minimal private version) with one Join action.
export default function InvitePage() {
    const params = useParams();
    const router = useRouter();
    const code = params?.code as string;

    const utils = trpc.useUtils();
    const { data, isLoading, error } = trpc.community.getInvitePreview.useQuery(
        { inviteCode: code },
        { enabled: !!code, retry: false },
    );

    const join = trpc.community.joinServer.useMutation({
        onSuccess: (res) => {
            utils.community.listServers.invalidate();
            router.push(`/communities/${res.serverId}`);
        },
        onError: (err) => toast.error(err.message),
    });

    return (
        <ScrollArea className="flex-1 bg-background">
            <div className="mx-auto flex min-h-svh w-full max-w-sm flex-col justify-center px-5 py-16">
                {isLoading && (
                    <div className="overflow-hidden rounded-3xl">
                        <div className="h-64 shimmer-skeleton" />
                    </div>
                )}

                {error && (
                    <div className="py-10 text-center">
                        <p className="text-[16px] font-bold text-zinc-300">This invite doesn&apos;t work</p>
                        <p className="mt-1 text-[14px] font-medium text-zinc-500">{error.message}</p>
                        <button
                            onClick={() => router.push("/communities")}
                            className="mx-auto mt-6 flex h-12 cursor-pointer items-center rounded-full bg-white/10 px-6 text-[14px] font-bold text-white transition-colors hover:bg-white/20"
                        >
                            Back to communities
                        </button>
                    </div>
                )}

                {data && (
                    <>
                        <p className="mb-4 text-center text-[14px] font-semibold text-zinc-500">
                            You&apos;ve been invited to join
                        </p>
                        <ServerProfileCard
                            name={data.name}
                            imageUrl={data.imageUrl}
                            tag={data.tag}
                            bannerColor={data.bannerColor}
                            bannerImageUrl={data.bannerImageUrl}
                            description={data.description}
                            traits={data.traits}
                            memberCount={data.memberCount}
                            createdAt={data.createdAt}
                            isPrivate={data.privateProfile}
                        />

                        <button
                            onClick={() => {
                                if (data.alreadyMember && data.serverId) router.push(`/communities/${data.serverId}`);
                                else join.mutate({ inviteCode: code });
                            }}
                            disabled={join.isPending || (!data.alreadyMember && data.invitesPaused)}
                            className={cn(
                                "mt-4 flex h-12 w-full cursor-pointer items-center justify-center rounded-full text-[15px] font-bold transition-colors disabled:pointer-events-none disabled:opacity-40",
                                "bg-white text-black hover:bg-white/90",
                            )}
                        >
                            {data.alreadyMember
                                ? "Open server"
                                : data.invitesPaused
                                  ? "Invites are paused"
                                  : join.isPending
                                    ? "Joining…"
                                    : "Accept invite"}
                        </button>

                        <button
                            onClick={() => router.push("/communities")}
                            className="mx-auto mt-3 cursor-pointer rounded-full px-4 py-2 text-[13px] font-semibold text-zinc-500 transition-colors hover:text-white"
                        >
                            No thanks
                        </button>
                    </>
                )}
            </div>
        </ScrollArea>
    );
}
