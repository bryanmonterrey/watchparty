// Top 24 categories for the home page (trimmed from kick_categories.json,
// already ordered by popularity). Thumbnails are served locally from
// public/thumbnails; tags capped at 2 for the card UI.

export interface HomeCategory {
    title: string;
    slug: string;
    thumbnailUrl: string;
    tags: string[];
}

export const HOME_CATEGORIES: HomeCategory[] = [
    {
        "title": "Grand Theft Auto V (GTA)",
        "slug": "/category/grand-theft-auto-v",
        "thumbnailUrl": "/thumbnails/grand-theft-auto-v.webp",
        "tags": [
            "Shooter",
            "Action"
        ]
    },
    {
        "title": "Just Chatting",
        "slug": "/category/just-chatting",
        "thumbnailUrl": "/thumbnails/just-chatting.webp",
        "tags": [
            "IRL",
            "Casual"
        ]
    },
    {
        "title": "Rust",
        "slug": "/category/rust",
        "thumbnailUrl": "/thumbnails/rust.webp",
        "tags": [
            "FPS",
            "Shooter"
        ]
    },
    {
        "title": "IRL",
        "slug": "/category/irl",
        "thumbnailUrl": "/thumbnails/irl.webp",
        "tags": [
            "IRL",
            "Adventure"
        ]
    },
    {
        "title": "Slots & Casino",
        "slug": "/category/slots",
        "thumbnailUrl": "/thumbnails/slots.webp",
        "tags": [
            "Gambling"
        ]
    },
    {
        "title": "Counter-Strike 2",
        "slug": "/category/counter-strike-2",
        "thumbnailUrl": "/thumbnails/counter-strike-2.webp",
        "tags": [
            "Shooter",
            "Tactical"
        ]
    },
    {
        "title": "League of Legends",
        "slug": "/category/league-of-legends",
        "thumbnailUrl": "/thumbnails/league-of-legends.webp",
        "tags": [
            "MOBA",
            "Action"
        ]
    },
    {
        "title": "World Cup 2026",
        "slug": "/category/world-cup-2026",
        "thumbnailUrl": "/thumbnails/world-cup-2026.webp",
        "tags": [
            "Sports"
        ]
    },
    {
        "title": "Marvel's Spider-Man 2",
        "slug": "/category/marvels-spider-man-2",
        "thumbnailUrl": "/thumbnails/marvels-spider-man-2.webp",
        "tags": [
            "Open World",
            "Action"
        ]
    },
    {
        "title": "Nightmare Shift",
        "slug": "/category/nightmare-shift",
        "thumbnailUrl": "/thumbnails/nightmare-shift.webp",
        "tags": [
            "Indie",
            "Adventure"
        ]
    },
    {
        "title": "Minecraft",
        "slug": "/category/minecraft",
        "thumbnailUrl": "/thumbnails/minecraft.webp",
        "tags": [
            "Adventure",
            "MMO"
        ]
    },
    {
        "title": "PUBG Mobile",
        "slug": "/category/pubg-mobile",
        "thumbnailUrl": "/thumbnails/pubg-mobile.webp",
        "tags": [
            "Shooter",
            "FPS"
        ]
    },
    {
        "title": "PUBG: Battlegrounds",
        "slug": "/category/pubg-battlegrounds",
        "thumbnailUrl": "/thumbnails/pubg-battlegrounds.webp",
        "tags": [
            "Shooter",
            "FPS"
        ]
    },
    {
        "title": "Sports",
        "slug": "/category/sports",
        "thumbnailUrl": "/thumbnails/sports.webp",
        "tags": [
            "IRL"
        ]
    },
    {
        "title": "VALORANT",
        "slug": "/category/valorant",
        "thumbnailUrl": "/thumbnails/valorant.webp",
        "tags": [
            "Shooter",
            "FPS"
        ]
    },
    {
        "title": "Devour",
        "slug": "/category/devour",
        "thumbnailUrl": "/thumbnails/devour.webp",
        "tags": [
            "Horror",
            "Survival"
        ]
    },
    {
        "title": "Old School RuneScape",
        "slug": "/category/old-school-runescape",
        "thumbnailUrl": "/thumbnails/old-school-runescape.webp",
        "tags": [
            "RPG",
            "MMO"
        ]
    },
    {
        "title": "Garena Free Fire",
        "slug": "/category/Garena-Free-Fire",
        "thumbnailUrl": "/thumbnails/Garena-Free-Fire.webp",
        "tags": [
            "Mobile Game",
            "Adventure Game"
        ]
    },
    {
        "title": "EA Sports FC 26",
        "slug": "/category/ea-sports-fc-26",
        "thumbnailUrl": "/thumbnails/ea-sports-fc-26.webp",
        "tags": [
            "Simulator",
            "Sport"
        ]
    },
    {
        "title": "Gothic 1 Remake",
        "slug": "/category/gothic-1-remake",
        "thumbnailUrl": "/thumbnails/gothic-1-remake.webp",
        "tags": [
            "Role-playing (RPG)",
            "Adventure"
        ]
    },
    {
        "title": "Dota 2",
        "slug": "/category/dota-2",
        "thumbnailUrl": "/thumbnails/dota-2.webp",
        "tags": [
            "MOBA",
            "Action"
        ]
    },
    {
        "title": "Fortnite",
        "slug": "/category/fortnite",
        "thumbnailUrl": "/thumbnails/fortnite.webp",
        "tags": [
            "Shooter",
            "Battle Royale"
        ]
    },
    {
        "title": "Tibia",
        "slug": "/category/Tibia",
        "thumbnailUrl": "/thumbnails/Tibia.webp",
        "tags": [
            "Adventure Game",
            "RPG"
        ]
    },
    {
        "title": "Pools, Hot Tubs & Bikinis",
        "slug": "/category/pools-hot-tubs-bikinis",
        "thumbnailUrl": "/thumbnails/pools-hot-tubs-bikinis.webp",
        "tags": [
            "IRL"
        ]
    }
];
