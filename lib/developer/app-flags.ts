// developer_apps.flags bitfield — a PURE module (no server imports).
// Bits are append-only: never renumber, never reuse a retired bit (same rule
// as lib/developer/bot-permissions.ts). The column is bigint(mode:number), so
// bits are safe up to 2^52.

export const APP_FLAGS = {
    /** App appears in the public directory ("Connect with watchparty"). */
    LISTED: 1 << 0, // 1
} as const;

export type AppFlagName = keyof typeof APP_FLAGS;

export function hasFlag(flags: number, flag: number): boolean {
    return (flags & flag) === flag;
}

export function setFlag(flags: number, flag: number): number {
    return flags | flag;
}

export function clearFlag(flags: number, flag: number): number {
    return flags & ~flag;
}
