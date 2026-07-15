"use client";

import { create } from "zustand";

// Reply target shared between the message list (sets it) and the chat input
// (shows the bar, sends replyToId). Keyed implicitly by the open channel —
// switching channels clears it via the input's channelId effect.
export type ReplyTarget = { id: string; userName: string; content: string };

type CommunityReplyStore = {
    replyTo: ReplyTarget | null;
    setReplyTo: (r: ReplyTarget | null) => void;
};

export const useCommunityReply = create<CommunityReplyStore>((set) => ({
    replyTo: null,
    setReplyTo: (replyTo) => set({ replyTo }),
}));
