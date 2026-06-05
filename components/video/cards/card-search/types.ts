export interface VideoResult {
    id: string;
    title: string;
    thumbnailUrl: string | null;
    duration?: number | null;
}

export interface ChannelResult {
    id: string;
    name: string;
    username: string;
    avatarUrl: string | null;
}

export interface PlaylistResult {
    id: string;
    title: string;
    videoCount?: number;
}

export type SearchSelectPayload = { url: string; title: string; thumbnailUrl?: string | null };
