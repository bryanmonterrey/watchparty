// Top 24 categories for the home page (trimmed from kick_categories.json,
// already ordered by popularity). Tags capped at 2 for the card UI.

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
        "thumbnailUrl": "https://files.kick.com/images/subcategories/8/banner/responsives/8110f223-9654-4536-bfee-6a324bbf03f9___banner_205_273.webp",
        "tags": [
            "Shooter",
            "Action"
        ]
    },
    {
        "title": "Just Chatting",
        "slug": "/category/just-chatting",
        "thumbnailUrl": "https://files.kick.com/images/subcategories/15/banner/responsives/b697a8a3-62db-4779-aa76-e4e47662af97___banner_294_392.webp",
        "tags": [
            "IRL",
            "Casual"
        ]
    },
    {
        "title": "Rust",
        "slug": "/category/rust",
        "thumbnailUrl": "https://files.kick.com/images/subcategories/13/banner/responsives/77786fd4-4f33-4221-b8ee-2bf3cb4d041e___banner_361_542.webp",
        "tags": [
            "FPS",
            "Shooter"
        ]
    },
    {
        "title": "IRL",
        "slug": "/category/irl",
        "thumbnailUrl": "https://files.kick.com/images/subcategories/8549/banner/responsives/3b142fca-b643-48d9-8ed0-405d454181d1___banner_199_266.webp",
        "tags": [
            "IRL",
            "Adventure"
        ]
    },
    {
        "title": "Slots & Casino",
        "slug": "/category/slots",
        "thumbnailUrl": "https://files.kick.com/images/subcategories/28/banner/responsives/ca01a05f-f807-4fbf-8794-3d547b1bb7a6___banner_245_327.webp",
        "tags": [
            "Gambling"
        ]
    },
    {
        "title": "Counter-Strike 2",
        "slug": "/category/counter-strike-2",
        "thumbnailUrl": "https://files.kick.com/images/subcategories/1552/banner/responsives/555d5ee4-5863-4546-8c4c-6ebca28dc60d___banner_245_327.webp",
        "tags": [
            "Shooter",
            "Tactical"
        ]
    },
    {
        "title": "League of Legends",
        "slug": "/category/league-of-legends",
        "thumbnailUrl": "https://files.kick.com/images/subcategories/5/banner/responsives/lol___banner_205_273.webp",
        "tags": [
            "MOBA",
            "Action"
        ]
    },
    {
        "title": "World Cup 2026",
        "slug": "/category/world-cup-2026",
        "thumbnailUrl": "https://files.kick.com/images/subcategories/13687/banner/responsives/36132a5c-c834-4999-be00-8df4f54c10e1___banner_238_238.webp",
        "tags": [
            "Sports"
        ]
    },
    {
        "title": "Marvel's Spider-Man 2",
        "slug": "/category/marvels-spider-man-2",
        "thumbnailUrl": "https://files.kick.com/images/subcategories/5446/banner/responsives/411cb880-4cc0-4a90-b71f-5a8590802348___banner_245_327.webp",
        "tags": [
            "Open World",
            "Action"
        ]
    },
    {
        "title": "Nightmare Shift",
        "slug": "/category/nightmare-shift",
        "thumbnailUrl": "https://files.kick.com/images/subcategories/11159/banner/responsives/f9e99783-557c-48b6-b280-1c57e1a6bb74___banner_238_238.webp",
        "tags": [
            "Indie",
            "Adventure"
        ]
    },
    {
        "title": "Minecraft",
        "slug": "/category/minecraft",
        "thumbnailUrl": "https://files.kick.com/images/subcategories/10/banner/responsives/0ca345bb-59db-48b2-bd2f-df88f55e4cc6___banner_294_392.webp",
        "tags": [
            "Adventure",
            "MMO"
        ]
    },
    {
        "title": "PUBG Mobile",
        "slug": "/category/pubg-mobile",
        "thumbnailUrl": "https://files.kick.com/images/subcategories/957/banner/responsives/fd20ebec-1cbb-42d5-b483-21cfcc7b4b6d___banner_205_273.webp",
        "tags": [
            "Shooter",
            "FPS"
        ]
    },
    {
        "title": "PUBG: Battlegrounds",
        "slug": "/category/pubg-battlegrounds",
        "thumbnailUrl": "https://files.kick.com/images/subcategories/53/banner/responsives/pubg-battlegrounds___banner_245_327.webp",
        "tags": [
            "Shooter",
            "FPS"
        ]
    },
    {
        "title": "Sports",
        "slug": "/category/sports",
        "thumbnailUrl": "https://files.kick.com/images/subcategories/75/banner/responsives/sports___banner_205_273.webp",
        "tags": [
            "IRL"
        ]
    },
    {
        "title": "VALORANT",
        "slug": "/category/valorant",
        "thumbnailUrl": "https://files.kick.com/images/subcategories/64/banner/responsives/11503974-52c2-4a54-9dea-ecbc3b0ffcce___banner_245_327.webp",
        "tags": [
            "Shooter",
            "FPS"
        ]
    },
    {
        "title": "Devour",
        "slug": "/category/devour",
        "thumbnailUrl": "https://files.kick.com/images/subcategories/257/banner/responsives/a94f1bfc-9440-4a8b-a88b-2ca9a9c1f551___banner_294_392.webp",
        "tags": [
            "Horror",
            "Survival"
        ]
    },
    {
        "title": "Old School RuneScape",
        "slug": "/category/old-school-runescape",
        "thumbnailUrl": "https://files.kick.com/images/subcategories/111/banner/responsives/f4bf565f-4258-4220-b568-2d52ae64c56b___banner_294_392.webp",
        "tags": [
            "RPG",
            "MMO"
        ]
    },
    {
        "title": "Garena Free Fire",
        "slug": "/category/Garena-Free-Fire",
        "thumbnailUrl": "https://files.kick.com/images/subcategories/157/banner/responsives/28233981-a866-4c6b-9120-c01d3195cb9e___banner_245_327.webp",
        "tags": [
            "Mobile Game",
            "Adventure Game"
        ]
    },
    {
        "title": "EA Sports FC 26",
        "slug": "/category/ea-sports-fc-26",
        "thumbnailUrl": "https://files.kick.com/images/subcategories/11216/banner/responsives/37738371-bfd2-43bf-86b6-eab64d325a6a___banner_237_237.webp",
        "tags": [
            "Simulator",
            "Sport"
        ]
    },
    {
        "title": "Gothic 1 Remake",
        "slug": "/category/gothic-1-remake",
        "thumbnailUrl": "https://files.kick.com/images/subcategories/13694/banner/responsives/9be44ca6-a2e9-41b3-a4cd-3b30e45b2ba6___banner_264_264.webp",
        "tags": [
            "Role-playing (RPG)",
            "Adventure"
        ]
    },
    {
        "title": "Dota 2",
        "slug": "/category/dota-2",
        "thumbnailUrl": "https://files.kick.com/images/subcategories/14/banner/responsives/9720b78b-f76e-4d0f-9f0d-e60aa5bf424a___banner_294_392.webp",
        "tags": [
            "MOBA",
            "Action"
        ]
    },
    {
        "title": "Fortnite",
        "slug": "/category/fortnite",
        "thumbnailUrl": "https://files.kick.com/images/subcategories/3/banner/responsives/a12b84e6-f2fd-43a3-9c2b-30173fc42f66___banner_245_327.webp",
        "tags": [
            "Shooter",
            "Battle Royale"
        ]
    },
    {
        "title": "Tibia",
        "slug": "/category/Tibia",
        "thumbnailUrl": "https://files.kick.com/images/subcategories/108/banner/responsives/95d59ea8-b5b8-4093-87f5-b3dbcc70cd3e___banner_205_273.webp",
        "tags": [
            "Adventure Game",
            "RPG"
        ]
    },
    {
        "title": "Pools, Hot Tubs & Bikinis",
        "slug": "/category/pools-hot-tubs-bikinis",
        "thumbnailUrl": "https://files.kick.com/images/subcategories/16/banner/responsives/918d2983-47b8-41af-b044-38980d39d887___banner_245_327.webp",
        "tags": [
            "IRL"
        ]
    }
];
