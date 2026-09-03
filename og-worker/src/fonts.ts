import medium from "../fonts/Geist-Medium.ttf";
import semibold from "../fonts/Geist-SemiBold.ttf";
import bold from "../fonts/Geist-Bold.ttf";
import pixel from "../fonts/GeistPixel-Triangle.ttf";
import { FONT, PIXEL } from "./tokens";

// Geist has no CJK/Arabic/Devanagari glyphs; add a Noto subset as a fallback
// entry here when that shows up (satori falls through by glyph).
export const fonts = [
    { name: FONT, data: medium, weight: 500 as const, style: "normal" as const },
    { name: FONT, data: semibold, weight: 600 as const, style: "normal" as const },
    { name: FONT, data: bold, weight: 700 as const, style: "normal" as const },
    { name: PIXEL, data: pixel, weight: 400 as const, style: "normal" as const },
];
