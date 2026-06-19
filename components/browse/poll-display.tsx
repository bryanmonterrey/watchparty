"use client";

import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/date-utils";
import { usePoll } from "./poll-context";

interface PollDisplayProps {
    postId: string;
}

export function PollDisplay({ postId }: PollDisplayProps) {
    const poll = usePoll(postId);
    const utils = trpc.useUtils();
    // Refresh both the batched feed query and the standalone per-post query so the
    // result updates regardless of which path provided this poll.
    const vote = trpc.content.votePoll.useMutation({
        onSuccess: () => {
            utils.content.getPollsForPosts.invalidate();
            utils.content.getPollForPost.invalidate({ postId });
        },
    });

    if (!poll) return null;

    const hasVoted = poll.userVote !== null;
    const isEnded = poll.isEnded || (poll.endsAt ? new Date(poll.endsAt) < new Date() : false);
    const showResults = hasVoted || isEnded;

    const handleVote = (optionId: string) => {
        if (hasVoted || isEnded) return;
        vote.mutate({ pollId: poll.id, optionIds: [optionId] });
    };

    return (
        <div className="mb-3 rounded-2xl border border-white/10 bg-zinc-900/40 p-4">
            <p className="text-[15px] text-zinc-100 font-medium mb-3">{poll.question}</p>
            <div className="flex flex-col gap-2">
                {(poll.options as any[]).map((option: any) => {
                    const pct = poll.totalVotes > 0 ? Math.round((option.votesCount / poll.totalVotes) * 100) : 0;
                    const isSelected = poll.userVote?.includes(option.id);
                    const isWinner = showResults && (poll.options as any[]).reduce((max: any, o: any) => o.votesCount > max.votesCount ? o : max, (poll.options as any[])[0]).id === option.id;

                    return (
                        <button
                            key={option.id}
                            disabled={hasVoted || isEnded || vote.isPending}
                            onClick={() => handleVote(option.id)}
                            className={cn(
                                "relative w-full rounded-full border text-left px-4 py-2 text-sm font-medium transition-colors overflow-hidden",
                                showResults ? "cursor-default" : "cursor-pointer hover:border-white/30",
                                isSelected
                                    ? "border-lantern text-lantern"
                                    : "border-white/20 text-zinc-200",
                            )}
                        >
                            {/* Progress bar behind */}
                            {showResults && (
                                <span
                                    className={cn(
                                        "absolute inset-y-0 left-0 rounded-full transition-all duration-500",
                                        isSelected ? "bg-lantern/20" : "bg-white/8"
                                    )}
                                    style={{ width: `${pct}%` }}
                                />
                            )}
                            <span className="relative flex items-center justify-between">
                                <span>{option.text}</span>
                                {showResults && (
                                    <span className={cn("text-xs font-bold", isSelected ? "text-lantern" : "text-zinc-400")}>
                                        {pct}%
                                    </span>
                                )}
                            </span>
                        </button>
                    );
                })}
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-zinc-500">
                <span>{poll.totalVotes} {poll.totalVotes === 1 ? "vote" : "votes"}</span>
                {isEnded ? (
                    <span>· Final results</span>
                ) : poll.endsAt ? (
                    <span>· Ends {formatRelativeTime(new Date(poll.endsAt).toISOString())}</span>
                ) : null}
            </div>
        </div>
    );
}
