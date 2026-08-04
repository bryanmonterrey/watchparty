"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { ChevronDown, ChevronUp } from "lucide-react";
import { PostCard } from "./post-card";
import { PostCardSkeleton } from "./post-card-skeleton";
import { CommentComposer } from "./comment-composer";

interface CommentSectionProps {
    postId: string;
    hideComposer?: boolean;
}

export function CommentSection({ postId, hideComposer = false }: CommentSectionProps) {
    const { data, isLoading } = trpc.comment.getComments.useQuery({ postId, limit: 20 });

    return (
        <div className="flex flex-col gap-3">
            {/* Compose — the full reply composer (text, emoji, GIF,
                images, link preview). See comment-composer.tsx. */}
            {!hideComposer && <CommentComposer postId={postId} />}

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
