export const CARD_TYPES = ["video", "playlist", "channel", "link", "poll"] as const;
export type CardType = (typeof CARD_TYPES)[number];

export interface VideoCard {
    id: string;
    postId: string;
    type: CardType;
    title: string | null;
    message: string | null;
    url: string | null;
    startTime: number;
    duration: number;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
}

export interface DraftCard {
    id: string;          // temp id (prefix "draft-") or real id after save
    postId: string;
    type: CardType;
    title: string;
    message: string;
    url: string;
    thumbnailUrl?: string | null;  // display-only, not persisted to DB
    startTime: number;
    duration: number;
    sortOrder: number;
    isPersisted: boolean;
}

export const CARD_TYPE_LABELS: Record<CardType, string> = {
    video: "Video",
    playlist: "Playlist",
    channel: "Channel",
    link: "Link",
    poll: "Poll",
};

export const CARD_TYPE_ICONS: Record<CardType, string> = {
    video: "M",
    playlist: "P",
    channel: "C",
    link: "L",
    poll: "?",
};
