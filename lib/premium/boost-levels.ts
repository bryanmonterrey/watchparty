// Server boost levels: perks unlock as a server accumulates boosts.
// Mirrors lib/premium/boosts.ts (packs) — this is what boosts BUY the server.

export type BoostLevel = {
    level: 0 | 1 | 2 | 3;
    /** boosts needed to reach this level */
    threshold: number;
    /** custom emoji slots (expressions kind='emoji') */
    emojiSlots: number;
    /** sticker slots (expressions kind='sticker') */
    stickerSlots: number;
    /** profile-card banner image upload */
    bannerImage: boolean;
};

export const BOOST_LEVELS: BoostLevel[] = [
    { level: 0, threshold: 0, emojiSlots: 10, stickerSlots: 5, bannerImage: false },
    { level: 1, threshold: 2, emojiSlots: 25, stickerSlots: 15, bannerImage: true },
    { level: 2, threshold: 7, emojiSlots: 50, stickerSlots: 30, bannerImage: true },
    { level: 3, threshold: 14, emojiSlots: 100, stickerSlots: 60, bannerImage: true },
];

export function boostLevelFor(boostCount: number): BoostLevel {
    let current = BOOST_LEVELS[0];
    for (const lvl of BOOST_LEVELS) {
        if (boostCount >= lvl.threshold) current = lvl;
    }
    return current;
}

/** next level up, or null at max */
export function nextBoostLevel(boostCount: number): BoostLevel | null {
    const current = boostLevelFor(boostCount);
    return BOOST_LEVELS.find((l) => l.level === current.level + 1) ?? null;
}
