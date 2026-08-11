// Bot community-install permissions — a bitfield stored per (bot, community)
// on developer_bot_installs. A bot can do NOTHING in a community it isn't
// installed in, and only what its bits allow where it is. This mirrors
// Discord's permission-integer model: cheap to store (one int), cheap to check
// (a single AND), and it composes with the fail-closed bot auth in
// server/trpc.ts — the token gets a bot into the API, the install decides what
// it may touch in each community, and both must pass.
//
// Bits are append-only: never renumber an existing one (stored integers would
// silently change meaning). Add new capabilities at the next free bit.
export const BOT_PERMISSIONS = {
    /** Post messages into the community's channels. */
    SEND_MESSAGES: 1 << 0, // 1
    /** Create/update coin-alert automations for the community. */
    MANAGE_COIN_ALERTS: 1 << 1, // 2
    /** Moderate: delete messages, timeout members. */
    MODERATE: 1 << 2, // 4
    /** Read the member roster. */
    READ_MEMBERS: 1 << 3, // 8
} as const;

export type BotPermissionName = keyof typeof BOT_PERMISSIONS;

/** Every currently-defined bit OR'd together (the "grant everything" value). */
export const ALL_BOT_PERMISSIONS = Object.values(BOT_PERMISSIONS).reduce((a, b) => a | b, 0);

/** True iff `bits` grants `perm` in full. Single flag or an OR of flags. */
export function hasPermission(bits: number, perm: number): boolean {
    return (bits & perm) === perm;
}

/**
 * Reject a permissions integer that isn't a clean subset of what exists — an
 * out-of-range or non-integer value must never be stored (it would set a bit no
 * capability reads today but a future one might, silently granting it). Returns
 * the sanitised value (unknown bits masked off) so callers store only real bits.
 */
export function sanitizePermissions(bits: unknown): number {
    if (typeof bits !== "number" || !Number.isInteger(bits) || bits < 0) return 0;
    return bits & ALL_BOT_PERMISSIONS;
}

/** Expand a bitfield into the granted permission names (for UI / responses). */
export function permissionNames(bits: number): BotPermissionName[] {
    return (Object.keys(BOT_PERMISSIONS) as BotPermissionName[]).filter((k) =>
        hasPermission(bits, BOT_PERMISSIONS[k]),
    );
}
