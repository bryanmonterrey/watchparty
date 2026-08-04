"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useAuthSession } from "@/hooks/use-auth-session";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, ChevronUp } from "lucide-react";
import { PostCard } from "./post-card";
import { PostCardSkeleton } from "./post-card-skeleton";

interface CommentSectionProps {
    postId: string;
    hideComposer?: boolean;
}

export function CommentSection({ postId, hideComposer = false }: CommentSectionProps) {
    const utils = trpc.useUtils();
    const { data, isLoading } = trpc.comment.getComments.useQuery({ postId, limit: 20 });

    const createComment = trpc.comment.createComment.useMutation({
        onSuccess: () => utils.comment.getComments.invalidate({ postId }),
    });

    const [text, setText] = useState("");

    const { data: session } = useAuthSession();
    const viewerAvatar = (session?.user as { avatar_url?: string | null; image?: string | null } | undefined)?.avatar_url
        ?? session?.user?.image
        ?? null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!text.trim()) return;
        createComment.mutate({ postId, content: text.trim() });
        setText("");
    };

    return (
        <div className="flex flex-col gap-3">
            {/* Compose */}
            {!hideComposer && (
                <form onSubmit={handleSubmit} className="flex items-center gap-2">
                    {/* The signed-in user's own avatar. This was a bare grey
                        disc — not a fallback, just a coloured div that never
                        tried to show anyone. AvatarFallback carries the shared
                        /avatar.png, so a user with no image still gets the house
                        placeholder rather than a letter. */}
                    <Avatar className="size-8 shrink-0">
                        <AvatarImage src={viewerAvatar ?? undefined} alt="" className="object-cover" />
                        <AvatarFallback />
                    </Avatar>
                    <div className="flex-1 flex items-center gap-2">
                        <input
                            value={text}
                            onChange={e => setText(e.target.value)}
                            placeholder="Post your reply"
                            className="flex-1 bg-transparent text-[14px] text-zinc-200 placeholder:text-zinc-500 outline-none transition-colors"
                            maxLength={1000}
                        />
                        <button
                            type="submit"
                            disabled={!text.trim() || createComment.isPending}
                            className="h-11 shrink-0 text-sm font-bold text-black bg-white hover:bg-zinc-200 disabled:opacity-40 px-5 rounded-full transition-colors"
                        >
                            Reply
                        </button>
                    </div>
                </form>
            )}

            {/* Comments list */}
            {isLoading ? (
                <div className="flex flex-col">
                    {[0, 1, 2, 3].map(i => (
                        <PostCardSkeleton key={i} />
                    ))}
                </div>
            ) : (
                <div className="flex flex-col">
                    {data?.comments.map(comment => (
                        <CommentItem 
                            key={comment.id} 
                            comment={comment} 
                            postId={postId} 
                        />
                    ))}
                    {data?.comments.length === 0 && (
                        <p className="text-sm text-zinc-500 py-2"></p>
                    )}
                </div>
            )}
        </div>
    );
}

function CommentItem({ comment, postId }: { comment: any; postId: string }) {
    const [showReplies, setShowReplies] = useState(false);
    const { data: repliesData } = trpc.comment.getReplies.useQuery(
        { parentId: comment.id },
        { enabled: showReplies }
    );

    const hasReplies = (repliesData?.replies?.length ?? 0) > 0;

    return (
        <div className="flex flex-col">
            <PostCard 
                post={comment as any} 
                connectBottom={showReplies && hasReplies}
            />
            
            {/* Show/hide replies button */}
            {(hasReplies || showReplies) && (
                <div className="pl-16">
                    <button
                        onClick={() => setShowReplies(prev => !prev)}
                        className="flex items-center gap-1 my-2 text-[13px] font-medium text-lantern hover:underline"
                    >
                        {showReplies ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        {showReplies ? "Hide replies" : `Show ${repliesData?.replies?.length || ""} replies`}
                    </button>
                </div>
            )}

            {/* Replies */}
            {showReplies && hasReplies && (
                <div className="flex flex-col">
                    {repliesData?.replies?.map((reply, index) => (
                        <PostCard 
                            key={reply.id} 
                            post={reply as any}
                            connectTop={true}
                            connectBottom={index < (repliesData.replies.length - 1)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
