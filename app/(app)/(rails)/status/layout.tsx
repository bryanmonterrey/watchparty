import React from "react";
import { FeedFrame } from "@/components/browse/feed-frame";

// A post gets the same columns the feed does.
//
// It used to get them by living at /feed/post/<id>, under feed/layout.tsx. The
// move to /status/<id> took it out from under that layout and the page arrived
// bare — one column on an empty row. This puts the frame back, from the same
// definition the feed uses, so the two can't drift.
export default function StatusLayout({ children }: { children: React.ReactNode }) {
    return <FeedFrame>{children}</FeedFrame>;
}
