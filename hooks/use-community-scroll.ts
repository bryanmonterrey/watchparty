"use client";

import { useEffect, useState } from "react";

type CommunityScrollProps = {
    chatRef: React.RefObject<HTMLDivElement | null>;
    bottomRef: React.RefObject<HTMLDivElement | null>;
    shouldLoadMore: boolean;
    loadMore: () => void;
    count: number;
};

export function useCommunityScroll({
    chatRef,
    bottomRef,
    shouldLoadMore,
    loadMore,
    count,
}: CommunityScrollProps) {
    const [hasInitialized, setHasInitialized] = useState(false);

    // Infinite scroll: load more when scrolled to top
    useEffect(() => {
        const topDiv = chatRef?.current;

        const handleScroll = () => {
            const scrollTop = topDiv?.scrollTop;
            if (scrollTop === 0 && shouldLoadMore) loadMore();
        };

        topDiv?.addEventListener("scroll", handleScroll);
        return () => topDiv?.removeEventListener("scroll", handleScroll);
    }, [shouldLoadMore, loadMore, chatRef]);

    // Auto-scroll to bottom on new messages / initial load
    useEffect(() => {
        const bottomDiv = bottomRef?.current;
        const topDiv = chatRef.current;

        const shouldAutoScroll = () => {
            if (!hasInitialized && bottomDiv) {
                setHasInitialized(true);
                return true;
            }

            if (!topDiv) return false;

            const distanceFromBottom =
                topDiv.scrollHeight - topDiv.scrollTop - topDiv.clientHeight;
            return distanceFromBottom <= 100;
        };

        if (shouldAutoScroll()) {
            setTimeout(() => {
                bottomRef.current?.scrollIntoView({ behavior: "smooth" });
            }, 100);
        }
    }, [bottomRef, chatRef, count, hasInitialized]);
}
