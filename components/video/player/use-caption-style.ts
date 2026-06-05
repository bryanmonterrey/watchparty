"use client";

import { useState, useCallback } from "react";
import { store } from "./types";

export type CaptionFontFamily = "sans" | "mono-sans" | "serif" | "mono-serif" | "casual" | "script" | "small-caps";
export type CaptionColor = "white" | "yellow" | "green" | "cyan" | "blue" | "magenta" | "red" | "black";
export type CaptionEdgeStyle = "none" | "depressed" | "uniform" | "drop-shadow" | "raised";
export type CaptionOpacity = 0 | 25 | 50 | 75 | 100;
export type CaptionFontSize = 50 | 75 | 100 | 150 | 200 | 300 | 400;

export interface CaptionStyle {
    fontFamily: CaptionFontFamily;
    fontColor: CaptionColor;
    fontSize: CaptionFontSize;
    bgColor: CaptionColor;
    bgOpacity: CaptionOpacity;
    windowColor: CaptionColor;
    windowOpacity: CaptionOpacity;
    edgeStyle: CaptionEdgeStyle;
    fontOpacity: CaptionOpacity;
}

const DEFAULTS: CaptionStyle = {
    fontFamily: "sans",
    fontColor: "white",
    fontSize: 100,
    bgColor: "black",
    bgOpacity: 75,
    windowColor: "black",
    windowOpacity: 0,
    edgeStyle: "none",
    fontOpacity: 100,
};

const COLOR_MAP: Record<CaptionColor, string> = {
    white: "#ffffff", yellow: "#ffff00", green: "#00ff00", cyan: "#00ffff",
    blue: "#0000ff", magenta: "#ff00ff", red: "#ff0000", black: "#080808",
};

const FONT_FAMILY_MAP: Record<CaptionFontFamily, string> = {
    sans: "Roboto, Arial, Helvetica, Verdana, sans-serif",
    "mono-sans": "\"Courier New\", Courier, monospace",
    serif: "Georgia, \"Times New Roman\", Times, serif",
    "mono-serif": "\"Courier New\", Courier, monospace",
    casual: "Comic Sans MS, cursive",
    script: "Brush Script MT, cursive",
    "small-caps": "Roboto, Arial, sans-serif",
};

export function hexWithOpacity(color: CaptionColor, opacity: CaptionOpacity): string {
    const hex = COLOR_MAP[color];
    const a = opacity / 100;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export function edgeStyleToTextShadow(style: CaptionEdgeStyle, color: string): string {
    switch (style) {
        case "depressed": return `1px 1px 0 ${color}, -1px -1px 0 ${color}`;
        case "uniform": return `0 0 4px #000, 0 0 4px #000, 0 0 4px #000, 0 0 4px #000`;
        case "drop-shadow": return `2px 2px 3px #000, 2px 2px 6px #000`;
        case "raised": return `-1px -1px 0 ${color}, 1px 1px 0 #000`;
        default: return "none";
    }
}

function load(): CaptionStyle {
    try {
        const saved = store.get("ytp-caption-style", "");
        return saved ? { ...DEFAULTS, ...JSON.parse(saved) } : DEFAULTS;
    } catch {
        return DEFAULTS;
    }
}

export function useCaptionStyle() {
    const [style, setStyle] = useState<CaptionStyle>(load);

    const update = useCallback(<K extends keyof CaptionStyle>(key: K, value: CaptionStyle[K]) => {
        setStyle(prev => {
            const next = { ...prev, [key]: value };
            store.set("ytp-caption-style", JSON.stringify(next));
            return next;
        });
    }, []);

    const reset = useCallback(() => {
        store.set("ytp-caption-style", "");
        setStyle(DEFAULTS);
    }, []);

    const css = {
        fontFamily: FONT_FAMILY_MAP[style.fontFamily],
        color: hexWithOpacity(style.fontColor, style.fontOpacity),
        fontSize: `clamp(13px, ${(1.8 * style.fontSize) / 100}vw, ${(20 * style.fontSize) / 100}px)`,
        background: hexWithOpacity(style.bgColor, style.bgOpacity),
        textShadow: edgeStyleToTextShadow(style.edgeStyle, COLOR_MAP[style.fontColor]),
        fontVariant: style.fontFamily === "small-caps" ? "small-caps" : "normal" as const,
        windowBackground: hexWithOpacity(style.windowColor, style.windowOpacity),
    };

    return { style, update, reset, css };
}

export type UseCaptionStyleReturn = ReturnType<typeof useCaptionStyle>;
