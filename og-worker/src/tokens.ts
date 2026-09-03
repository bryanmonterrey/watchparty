// Brand tokens for the cards. Fixed-dark: a share card is never themed.
// Mirrors app/globals.css + docs/design-principles.md; keep the hexes in sync.
export const C = {
    canvas: "#050505",
    panel: "#0a0a0a",
    raised: "#111214",
    white: "#ffffff",
    text: "#e7e9ea",
    muted: "#7F878E", // pastelgray
    hair: "rgba(138,145,158,0.2)",
    fill: "rgba(255,255,255,0.06)",
    fill2: "rgba(255,255,255,0.03)",
    highlight: "rgba(255,255,255,0.06)",
    accent: "#358efc", // twitter2
    up: "#00ED89", // lantern — price up ONLY
    down: "#FF746C", // pastelred
    star: "#FCE0CB",
} as const;

export const FONT = "Geist";
export const PIXEL = "GeistPixel";

export const R = { panel: 40, tile: 48, hero: 32, chip: 999 } as const;
