import React from "react";
import { FeedFrame } from "@/components/browse/feed-frame";

// /feed in home's column frame. The frame itself lives in components so
// /status can render the identical one — see feed-frame.tsx.
export default function FeedLayout({ children }: { children: React.ReactNode }) {
    return <FeedFrame>{children}</FeedFrame>;
}
