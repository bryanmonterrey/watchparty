export interface Video {
    id: string;
    title: string;
    description: string | null;
    thumbnailUrl: string | null;
    videoUrl: string;
    views: number;
    createdAt: Date;
    category: string | null;
    ticker?: string | null;
    tokenStatus?: string | null;
    tokenAddress?: string | null;
    marketCapUsd?: number | null;
    user: {
        id: string;
        name: string;
        username: string | null;
        avatar_url: string | null;
        verifiedTier?: string | null;
    };
}

export const CATEGORIES = [
    "All", "Trending", "For You", "New", "Live", "Movies", "Just Chatting", "Music", "Esports",
    "Creative", "Tech", "News", "Memes", "Political", "Games", "IRL",
    "GTAV", "Sports", "Fortnite", "Pranks"
];
