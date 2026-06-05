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
    user: {
        id: string;
        name: string;
        username: string | null;
        avatar_url: string | null;
        verifiedTier?: string | null;
    };
}

export const CATEGORIES = [
    "All", "Trending", "For You", "New", "Live", "Just Chatting", "Music", "Esports",
    "Creative", "Tech", "News", "Memes", "Political", "Games", "IRL",
    "GTAV", "Sports", "Fortnite", "Pranks"
];
