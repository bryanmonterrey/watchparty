const HOVER_PALETTE = [
    "var(--color-jewel)",
    "var(--color-soft-pink)",
    "var(--color-soft-blue)",
    "var(--color-bleu)",
    "var(--color-pastel-yellow)",
    "var(--color-bitcoin-orange)",
    "var(--color-sharp-gray)",
    "var(--color-soft-gray)",
    "var(--color-vice-purple)",
];

/** Palette color that looks varied while remaining stable across renders. */
export function stableHoverColor(id: string) {
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
    return HOVER_PALETTE[hash % HOVER_PALETTE.length];
}
