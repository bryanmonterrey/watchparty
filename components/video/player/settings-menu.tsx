"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { PLAYBACK_RATES } from "./types";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import type { UseCaptionStyleReturn, CaptionFontFamily, CaptionColor, CaptionEdgeStyle, CaptionOpacity, CaptionFontSize } from "./use-caption-style";
import { hexWithOpacity } from "./use-caption-style";

type View = "main" | "speed" | "quality" | "audio" | "subtitles" | "auto-translate" | "sleep"
    | "caption-options" | "caption-font-family" | "caption-font-color" | "caption-font-size"
    | "caption-bg-color" | "caption-bg-opacity" | "caption-window-color" | "caption-window-opacity"
    | "caption-edge-style" | "caption-font-opacity";
type Dir = "forward" | "back";

const SLEEP_OPTIONS = [
    { label: "Off", value: 0 },
    { label: "10 minutes", value: 10 },
    { label: "15 minutes", value: 15 },
    { label: "20 minutes", value: 20 },
    { label: "30 minutes", value: 30 },
    { label: "45 minutes", value: 45 },
    { label: "60 minutes", value: 60 },
    { label: "End of video", value: -1 },
];

const AUTO_TRANSLATE_LANGS = [
    "Afrikaans", "Albanian", "Arabic", "Armenian", "Azerbaijani",
    "Basque", "Bengali", "Bosnian", "Bulgarian", "Catalan",
    "Chinese (Simplified)", "Chinese (Traditional)", "Croatian", "Czech",
    "Danish", "Dutch", "English", "Estonian", "Filipino", "Finnish",
    "French", "Galician", "Georgian", "German", "Greek", "Gujarati",
    "Hebrew", "Hindi", "Hungarian", "Icelandic", "Indonesian",
    "Irish", "Italian", "Japanese", "Kannada", "Khmer", "Korean",
    "Latvian", "Lithuanian", "Macedonian", "Malay", "Maltese",
    "Marathi", "Norwegian", "Persian", "Polish", "Portuguese",
    "Portuguese (BR)", "Romanian", "Russian", "Serbian", "Slovak",
    "Slovenian", "Spanish", "Spanish (US)", "Swahili", "Swedish",
    "Tamil", "Telugu", "Thai", "Turkish", "Ukrainian", "Urdu",
    "Vietnamese", "Welsh",
];

// ── Caption option data ───────────────────────────────────────────────────────

const CAPTION_FONT_FAMILIES: { value: CaptionFontFamily; label: string }[] = [
    { value: "sans", label: "Sans-Serif" },
    { value: "mono-sans", label: "Monospaced Sans-Serif" },
    { value: "serif", label: "Serif" },
    { value: "mono-serif", label: "Monospaced Serif" },
    { value: "casual", label: "Casual" },
    { value: "script", label: "Script" },
    { value: "small-caps", label: "Small Caps" },
];

const CAPTION_COLORS: { value: CaptionColor; hex: string }[] = [
    { value: "white", hex: "#ffffff" },
    { value: "yellow", hex: "#ffff00" },
    { value: "green", hex: "#00ff00" },
    { value: "cyan", hex: "#00ffff" },
    { value: "blue", hex: "#0000ff" },
    { value: "magenta", hex: "#ff00ff" },
    { value: "red", hex: "#ff0000" },
    { value: "black", hex: "#080808" },
];

const CAPTION_FONT_SIZES: { value: CaptionFontSize; label: string }[] = [
    { value: 50, label: "50%" },
    { value: 75, label: "75%" },
    { value: 100, label: "100% (default)" },
    { value: 150, label: "150%" },
    { value: 200, label: "200%" },
    { value: 300, label: "300%" },
    { value: 400, label: "400%" },
];

const CAPTION_OPACITIES: { value: CaptionOpacity; label: string }[] = [
    { value: 0, label: "0% (transparent)" },
    { value: 25, label: "25%" },
    { value: 50, label: "50%" },
    { value: 75, label: "75%" },
    { value: 100, label: "100% (opaque)" },
];

const CAPTION_EDGE_STYLES: { value: CaptionEdgeStyle; label: string }[] = [
    { value: "none", label: "None" },
    { value: "depressed", label: "Depressed" },
    { value: "uniform", label: "Uniform" },
    { value: "drop-shadow", label: "Drop shadow" },
    { value: "raised", label: "Raised" },
];

const COLOR_LABELS: Record<CaptionColor, string> = {
    white: "White", yellow: "Yellow", green: "Green", cyan: "Cyan",
    blue: "Blue", magenta: "Magenta", red: "Red", black: "Black",
};

const FONT_FAMILY_LABELS: Record<CaptionFontFamily, string> = {
    sans: "Sans-Serif", "mono-sans": "Monospaced Sans-Serif", serif: "Serif",
    "mono-serif": "Monospaced Serif", casual: "Casual", script: "Script", "small-caps": "Small Caps",
};

// Speed presets shown as chips (subset of PLAYBACK_RATES)
const SPEED_CHIPS = [0.5, 1, 1.25, 1.5, 1.75, 2];
const SPEED_MIN = 0.25;
const SPEED_MAX = 2;

const variants = {
    enter: (dir: Dir) => ({ x: dir === "forward" ? 12 : -12, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: Dir) => ({ x: dir === "forward" ? -12 : 12, opacity: 0 }),
};
const transition = { duration: 0.16, ease: [0.25, 0.46, 0.45, 0.94] as const };

// ── Quality badge helper ──────────────────────────────────────────────────────
function qualityBadge(label: string): string | null {
    const m = label.match(/(\d+)/);
    if (!m) return null;
    const h = parseInt(m[1]);
    if (h >= 2160) return "4K";
    if (h >= 720) return "HD";
    return "SD";
}

// ── Shared row components ─────────────────────────────────────────────────────

function Row({ icon, label, right, onClick, focused }: {
    icon?: React.ReactNode;
    label: React.ReactNode;
    right?: React.ReactNode;
    onClick?: () => void;
    focused?: boolean;
}) {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => { if (focused) ref.current?.focus(); }, [focused]);

    return (
        <div
            ref={ref}
            role="menuitem"
            tabIndex={focused ? 0 : -1}
            className={cn(
                "flex items-center gap-3 px-4 py-[10px] cursor-pointer transition-colors select-none outline-none",
                focused ? "bg-white/15" : "hover:bg-white/10"
            )}
            onClick={onClick}
            onKeyDown={e => (e.key === "Enter" || e.key === " ") && onClick?.()}
        >
            {icon && <div className="w-6 h-6 flex-none flex items-center justify-center opacity-90">{icon}</div>}
            <div className="flex-1 text-white text-[14px] leading-snug">{label}</div>
            {right && <div className="flex-none flex items-center">{right}</div>}
        </div>
    );
}

function Toggle({ on }: { on: boolean }) {
    return (
        <div className={cn(
            "w-[34px] h-[20px] rounded-full relative transition-colors duration-200",
            on ? "bg-twitter2" : "bg-white/25"
        )}>
            <div className={cn(
                "absolute top-[2px] w-[16px] h-[16px] rounded-full bg-white shadow transition-all duration-200",
                on ? "left-[16px]" : "left-[2px]"
            )} />
        </div>
    );
}

function NavRight({ label, badge }: { label: string; badge?: string | null }) {
    return (
        <div className="flex items-center gap-1.5 text-white/55 text-[13px]">
            {badge && (
                <span className="bg-white/15 text-white/80 text-[10px] font-semibold px-1.5 py-0.5 rounded-md leading-none">
                    {badge}
                </span>
            )}
            <span>{label}</span>
            <ChevronRight size={15} className="opacity-70" />
        </div>
    );
}

function SubHeader({ label, onBack, right }: {
    label: string;
    onBack: () => void;
    right?: React.ReactNode;
}) {
    return (
        <div className="flex items-center gap-1 px-3 py-2 border-b border-white/10">
            <button
                className="p-1.5 hover:bg-white/10 rounded-full transition-colors flex items-center justify-center"
                onClick={onBack}
            >
                <ChevronLeft size={17} className="text-white" />
            </button>
            <span className="text-white text-[13.5px] font-medium flex-1">{label}</span>
            {right}
        </div>
    );
}

function SubRow({ label, badge, selected, onClick, focused }: {
    label: string;
    badge?: string | null;
    selected: boolean;
    onClick: () => void;
    focused?: boolean;
}) {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => { if (focused) ref.current?.focus(); }, [focused]);

    return (
        <div
            ref={ref}
            role="menuitemradio"
            aria-checked={selected}
            tabIndex={focused ? 0 : -1}
            className={cn(
                "flex items-center justify-between px-4 py-[10px] cursor-pointer transition-colors select-none outline-none",
                focused ? "bg-white/15" : "hover:bg-white/10"
            )}
            onClick={onClick}
            onKeyDown={e => (e.key === "Enter" || e.key === " ") && onClick()}
        >
            <div className="flex items-center gap-2">
                <span className={cn("text-[14px]", selected ? "text-twitter2 font-medium" : "text-white")}>{label}</span>
                {badge && (
                    <span className={cn(
                        "text-[10px] font-semibold px-1.5 py-0.5 rounded-md leading-none",
                        selected ? "bg-twitter2/20 text-twitter2" : "bg-white/15 text-white/70"
                    )}>
                        {badge}
                    </span>
                )}
            </div>
            <AnimatePresence>
                {selected && (
                    <motion.div
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        transition={{ duration: 0.15, ease: [0.34, 1.56, 0.64, 1] }}
                    >
                        <Check size={15} className="text-twitter2" />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

const IconStableVolume = () => (
    <svg fill="none" height="22" viewBox="0 0 24 24" width="22">
        <path d="M12 .99C5.92 .99 1 5.92 1 11.99C1 18.07 5.92 22.99 12 22.99C18.07 22.99 23 18.07 23 11.99C23 5.92 18.07 .99 12 .99ZM12 2.99C14.38 2.99 16.67 3.94 18.36 5.63C20.05 7.32 21 9.61 21 11.99C21 14.38 20.05 16.67 18.36 18.36C16.67 20.05 14.38 20.99 12 20.99C9.61 20.99 7.32 20.05 5.63 18.36C3.94 16.67 3 14.38 3 11.99C3 9.61 3.94 7.32 5.63 5.63C7.32 3.94 9.61 2.99 12 2.99ZM14 6C13.73 6 13.48 6.1 13.29 6.29C13.1 6.48 13 6.73 13 7V17C13 17.26 13.1 17.52 13.29 17.7C13.48 17.89 13.73 18 14 18C14.26 18 14.51 17.89 14.7 17.7C14.89 17.52 15 17.26 15 17V7C15 6.73 14.89 6.48 14.7 6.29C14.51 6.1 14.26 6 14 6ZM10 8C9.73 8 9.48 8.1 9.29 8.29C9.1 8.48 9 8.73 9 9V15C9 15.26 9.1 15.52 9.29 15.7C9.48 15.89 9.73 16 10 16C10.26 16 10.51 15.89 10.7 15.7C10.89 15.52 11 15.26 11 15V9C11 8.73 10.89 8.48 10.7 8.29C10.51 8.1 10.26 8 10 8ZM18 9C17.73 9 17.48 9.1 17.29 9.29C17.1 9.48 17 9.73 17 10V14C17 14.26 17.1 14.52 17.29 14.7C17.48 14.89 17.73 15 18 15C18.26 15 18.51 14.89 18.7 14.7C18.89 14.52 19 14.26 19 14V10C19 9.73 18.89 9.48 18.7 9.29C18.51 9.1 18.26 9 18 9ZM6 10C5.73 10 5.48 10.1 5.29 10.29C5.1 10.48 5 10.73 5 11V13C5 13.26 5.1 13.52 5.29 13.7C5.48 13.89 5.73 14 6 14C6.26 14 6.51 13.89 6.7 13.7C6.89 13.52 7 13.26 7 13V11C7 10.73 6.89 10.48 6.7 10.29C6.51 10.1 6.26 10 6 10Z" fill="white" />
    </svg>
);

const IconAmbientMode = () => (
    <svg fill="none" height="22" viewBox="0 0 24 24" width="22">
        <path d="M12 .5C11.73 .5 11.48 .6 11.29 .79C11.1 .98 11 1.23 11 1.5V3.5C11 3.76 11.1 4.01 11.29 4.2C11.48 4.39 11.73 4.5 12 4.5C12.26 4.5 12.51 4.39 12.7 4.2C12.89 4.01 13 3.76 13 3.5V1.5C13 1.23 12.89 .98 12.7 .79C12.51 .6 12.26 .5 12 .5ZM3.79 1.29C3.61 1.46 3.51 1.7 3.5 1.94C3.48 2.19 3.56 2.43 3.72 2.63L3.79 2.7L5.29 4.2L5.37 4.27C5.56 4.42 5.8 4.5 6.04 4.49C6.29 4.47 6.52 4.37 6.7 4.2C6.87 4.02 6.97 3.79 6.99 3.54C7 3.3 6.92 3.06 6.77 2.86L6.7 2.79L5.2 1.29L5.13 1.22C4.93 1.06 4.69 .98 4.44 1C4.2 1.01 3.96 1.11 3.79 1.29ZM18.86 1.22L18.79 1.29L17.29 2.79L17.22 2.86C17.07 3.06 16.99 3.3 17 3.54C17.01 3.79 17.12 4.02 17.29 4.2C17.47 4.37 17.7 4.48 17.95 4.49C18.19 4.5 18.43 4.42 18.63 4.27L18.7 4.2L20.2 2.7L20.27 2.63C20.42 2.43 20.5 2.19 20.49 1.95C20.48 1.7 20.37 1.47 20.2 1.29C20.02 1.12 19.79 1.01 19.54 1C19.3 .99 19.06 1.07 18.86 1.22ZM19.2 6.01L19 6H5L4.79 6.01C4.3 6.06 3.84 6.29 3.51 6.65C3.18 7.02 2.99 7.5 3 8V16L3.01 16.2C3.05 16.66 3.26 17.08 3.58 17.41C3.91 17.73 4.33 17.94 4.79 17.99L5 18H19L19.2 17.98C19.66 17.94 20.08 17.73 20.41 17.41C20.73 17.08 20.94 16.66 20.99 16.2L21 16V8C20.99 7.5 20.81 7.02 20.48 6.66C20.15 6.29 19.69 6.06 19.2 6.01ZM5 16V8H19V16H5ZM17.29 19.79C17.11 19.96 17.01 20.2 17 20.44C16.98 20.69 17.06 20.93 17.22 21.13L17.29 21.2L18.79 22.7L18.86 22.77C19.06 22.92 19.3 23 19.54 22.99C19.79 22.98 20.02 22.87 20.2 22.7C20.37 22.52 20.48 22.29 20.49 22.04C20.5 21.8 20.42 21.56 20.27 21.36L20.2 21.29L18.7 19.79L18.63 19.72C18.43 19.56 18.19 19.48 17.94 19.5C17.7 19.51 17.46 19.61 17.29 19.79ZM5.37 19.72L5.29 19.79L3.79 21.29L3.72 21.36C3.57 21.56 3.49 21.8 3.5 22.04C3.51 22.29 3.62 22.52 3.79 22.7C3.97 22.87 4.2 22.98 4.45 22.99C4.69 23 4.93 22.92 5.13 22.77L5.2 22.7L6.7 21.2L6.77 21.13C6.92 20.93 7 20.69 6.99 20.45C6.97 20.2 6.87 19.97 6.7 19.79C6.52 19.62 6.29 19.52 6.04 19.5C5.8 19.49 5.56 19.57 5.37 19.72ZM12 19.5C11.73 19.5 11.48 19.6 11.29 19.79C11.1 19.98 11 20.23 11 20.5V22.5C11 22.76 11.1 23.01 11.29 23.2C11.48 23.39 11.73 23.5 12 23.5C12.26 23.5 12.51 23.39 12.7 23.2C12.89 23.01 13 22.76 13 22.5V20.5C13 20.23 12.89 19.98 12.7 19.79C12.51 19.6 12.26 19.5 12 19.5Z" fill="white" />
    </svg>
);

const IconAnnotations = () => (
    <svg fill="none" height="22" viewBox="0 0 24 24" width="22">
        <path d="M9.65 6L9.5 6H2.5L2.34 6C1.97 6.04 1.63 6.21 1.38 6.49C1.13 6.77 1 7.12 1 7.5V13.5L1 13.65C1.04 14.02 1.21 14.36 1.49 14.61C1.77 14.86 2.12 15 2.5 15H4.5L3.81 17.75C3.77 17.89 3.77 18.03 3.79 18.17C3.82 18.31 3.87 18.45 3.95 18.56C4.03 18.68 4.14 18.78 4.26 18.85C4.38 18.92 4.51 18.97 4.66 18.99L4.78 19H8.55L8.72 18.98C8.88 18.95 9.04 18.89 9.17 18.79C9.3 18.68 9.4 18.55 9.47 18.4L9.52 18.24L10.62 13.96C10.84 13.11 10.96 12.24 10.99 11.36L11 10.98V7.5C11 7.12 10.86 6.77 10.61 6.49C10.36 6.21 10.02 6.04 9.65 6ZM21.65 6L21.5 6H14.5L14.34 6C13.97 6.04 13.63 6.21 13.38 6.49C13.13 6.77 13 7.12 13 7.5V13.5L13 13.65C13.04 14.02 13.21 14.36 13.49 14.61C13.77 14.86 14.12 15 14.5 15H16.5L15.81 17.75C15.77 17.89 15.77 18.03 15.79 18.17C15.82 18.31 15.87 18.44 15.95 18.56C16.03 18.68 16.14 18.78 16.26 18.85C16.38 18.92 16.51 18.97 16.66 18.99L16.78 19H20.55L20.72 18.98C20.88 18.95 21.04 18.89 21.17 18.79C21.3 18.68 21.4 18.55 21.47 18.4L21.52 18.24L22.62 13.96C22.84 13.11 22.96 12.24 22.99 11.36L23 10.98V7.5C23 7.12 22.86 6.77 22.61 6.49C22.36 6.21 22.02 6.04 21.65 6ZM3 13V8H9V10.98C9 11.71 8.91 12.44 8.76 13.16L8.68 13.47L7.78 17H6.06L6.44 15.48L7.06 13H3ZM15 13V8H21V10.98C21 11.71 20.91 12.44 20.76 13.16L20.68 13.47L19.78 17H18.06L18.44 15.48L19.06 13H15Z" fill="white" />
    </svg>
);

const IconSubtitles = () => (
    <svg fill="none" height="22" viewBox="0 0 24 24" width="22">
        <path d="M21.2 3L21 3H3L2.79 3C2.3 3.06 1.84 3.29 1.51 3.65C1.18 4.02 .99 4.5 1 5V19L1.01 19.2C1.05 19.66 1.26 20.08 1.58 20.41C1.91 20.73 2.33 20.94 2.79 20.99L3 21H21L21.2 20.98C21.66 20.94 22.08 20.73 22.41 20.41C22.73 20.08 22.94 19.66 22.99 19.2L23 19V5C23 4.5 22.81 4.02 22.48 3.65C22.15 3.29 21.69 3.06 21.2 3ZM3 19V5H21V19H3ZM6.97 8.34C6.42 8.64 5.96 9.09 5.64 9.63L5.5 9.87C5.16 10.53 4.99 11.26 5 12L5 12.27C5.04 12.92 5.21 13.55 5.5 14.12L5.64 14.36C5.96 14.9 6.42 15.35 6.97 15.65L7.21 15.77C7.79 16.01 8.43 16.06 9.03 15.91L9.29 15.83C9.88 15.61 10.39 15.23 10.77 14.73C10.93 14.53 11 14.27 10.97 14.02C10.94 13.77 10.82 13.53 10.63 13.37C10.44 13.2 10.19 13.11 9.93 13.12C9.68 13.13 9.44 13.24 9.26 13.43L9.19 13.5C9.05 13.7 8.85 13.85 8.62 13.94L8.54 13.97C8.35 14.02 8.16 14 7.99 13.92L7.91 13.88C7.67 13.75 7.48 13.56 7.35 13.32L7.28 13.2C7.11 12.88 7.02 12.52 7 12.16L7 12C6.99 11.58 7.09 11.16 7.28 10.79L7.35 10.67C7.48 10.43 7.67 10.24 7.91 10.11C8.1 10 8.32 9.97 8.54 10.02L8.62 10.05C8.81 10.12 8.98 10.24 9.11 10.39L9.19 10.49L9.26 10.57C9.43 10.74 9.66 10.85 9.91 10.87C10.15 10.89 10.4 10.81 10.59 10.66C10.79 10.51 10.92 10.29 10.96 10.05C11.01 9.8 10.96 9.55 10.83 9.34L10.77 9.26L10.6 9.05C10.24 8.65 9.79 8.35 9.29 8.16L9.03 8.08C8.34 7.91 7.6 8 6.97 8.34ZM14.97 8.34C14.42 8.64 13.96 9.09 13.64 9.63L13.5 9.87C13.16 10.53 12.99 11.26 13 12L13 12.27C13.04 12.92 13.21 13.55 13.5 14.12L13.64 14.36C13.96 14.9 14.42 15.35 14.97 15.65L15.21 15.77C15.79 16.01 16.43 16.06 17.03 15.91L17.29 15.83C17.88 15.61 18.39 15.23 18.77 14.73C18.93 14.53 19 14.27 18.97 14.02C18.94 13.77 18.82 13.53 18.63 13.37C18.44 13.2 18.19 13.11 17.93 13.12C17.68 13.13 17.44 13.24 17.26 13.43L17.19 13.5C17.05 13.7 16.85 13.85 16.62 13.94L16.54 13.97C16.35 14.02 16.16 14 15.99 13.92L15.91 13.88C15.67 13.75 15.48 13.56 15.35 13.32L15.28 13.2C15.11 12.88 15.02 12.52 15 12.16L15 12C14.99 11.58 15.09 11.16 15.28 10.79L15.35 10.67C15.48 10.43 15.67 10.24 15.91 10.11C16.1 10 16.32 9.97 16.54 10.02L16.62 10.05C16.81 10.12 16.98 10.24 17.11 10.39L17.19 10.49L17.26 10.57C17.43 10.74 17.66 10.85 17.91 10.87C18.15 10.89 18.4 10.81 18.59 10.66C18.79 10.51 18.92 10.29 18.96 10.05C19.01 9.8 18.96 9.55 18.83 9.34L18.77 9.26L18.6 9.05C18.24 8.65 17.79 8.35 17.29 8.16L17.03 8.08C16.34 7.91 15.6 8 14.97 8.34Z" fill="white" />
    </svg>
);

const IconSleepTimer = () => (
    <svg fill="none" height="22" viewBox="0 0 24 24" width="22">
        <path d="M12.33 1C12.22 1 12.11 1 12 1C5.92 1 1 5.92 1 12C1 18.07 5.92 23 12 23C13.9 23 15.78 22.5 17.44 21.55C19.1 20.61 20.48 19.25 21.46 17.61L21.64 17.29C22.06 16.52 21.21 15.73 20.35 15.88C18.76 16.15 17.12 15.94 15.66 15.27C14.19 14.59 12.97 13.49 12.14 12.11C11.31 10.73 10.91 9.13 11.01 7.52C11.11 5.91 11.69 4.37 12.67 3.09L12.89 2.83C13.45 2.16 13.2 1.03 12.33 1ZM15.56 2.6C15.45 2.84 15.43 3.11 15.51 3.36C15.59 3.61 15.77 3.82 16.01 3.94C16.91 4.39 17.73 4.99 18.44 5.71L18.73 6.03L18.8 6.1C18.99 6.27 19.22 6.36 19.47 6.37C19.72 6.37 19.96 6.28 20.15 6.12C20.33 5.95 20.45 5.72 20.48 5.48C20.51 5.23 20.44 4.98 20.29 4.78L20.23 4.7L19.87 4.31C19.01 3.43 18.01 2.7 16.9 2.15C16.67 2.03 16.39 2.01 16.14 2.1C15.89 2.18 15.68 2.36 15.56 2.6ZM10.24 3.17C9.42 4.64 8.99 6.31 9 8C9 13.42 13.32 17.84 18.71 17.99C17.86 18.93 16.83 19.69 15.67 20.21C14.52 20.73 13.26 21 12 21C9.76 21 7.6 20.17 5.95 18.67C4.29 17.17 3.25 15.1 3.03 12.88C2.81 10.65 3.43 8.43 4.76 6.63C6.09 4.84 8.05 3.6 10.24 3.17ZM21.16 7.88C20.93 7.96 20.73 8.12 20.61 8.34C20.49 8.55 20.45 8.81 20.5 9.05L20.53 9.15L20.66 9.56C20.93 10.53 21.04 11.54 20.98 12.55C20.97 12.81 21.06 13.06 21.23 13.26C21.41 13.45 21.65 13.57 21.92 13.59C22.18 13.6 22.44 13.52 22.63 13.34C22.83 13.17 22.95 12.93 22.97 12.67C23.05 11.44 22.92 10.2 22.58 9.02L22.43 8.51L22.39 8.42C22.29 8.19 22.11 8.01 21.88 7.91C21.65 7.81 21.4 7.8 21.16 7.88Z" fill="white" />
    </svg>
);

const IconPlaybackSpeed = () => (
    <svg fill="currentColor" height="22" viewBox="0 0 24 24" width="22">
        <path d="M12 1c1.44 0 2.87.28 4.21.83a11 11 0 0 1 3.45 2.27l-1.81 1.05A9 9 0 0 0 3 12a9 9 0 0 0 18-.00l-.01-.44a8.99 8.99 0 0 0-.14-1.20l1.81-1.05A11.00 11.00 0 0 1 10.51 22.9 11 11 0 0 1 12 1Zm7.08 6.25-7.96 3.25a1.74 1.74 0 1 0 1.73 2.99l6.8-5.26a.57.57 0 0 0-.56-.98Z" />
    </svg>
);

const IconQuality = () => (
    <svg fill="none" height="22" viewBox="0 0 24 24" width="22">
        <path d="M9 3C8.11 3 7.25 3.29 6.54 3.83C5.84 4.38 5.34 5.14 5.12 6H3C2.73 6 2.48 6.1 2.29 6.29C2.1 6.48 2 6.73 2 7C2 7.26 2.1 7.51 2.29 7.7C2.48 7.89 2.73 8 3 8H5.12C5.34 8.85 5.84 9.61 6.55 10.16C7.25 10.7 8.11 11 9 11C9.88 11 10.74 10.7 11.44 10.16C12.15 9.61 12.65 8.85 12.87 8H21C21.26 8 21.51 7.89 21.7 7.7C21.89 7.51 22 7.26 22 7C22 6.73 21.89 6.48 21.7 6.29C21.51 6.1 21.26 6 21 6H12.87C12.65 5.14 12.15 4.38 11.45 3.83C10.74 3.29 9.88 3 9 3ZM9 5C9.53 5 10.03 5.21 10.41 5.58C10.78 5.96 11 6.46 11 7C11 7.53 10.78 8.03 10.41 8.41C10.03 8.78 9.53 9 9 9C8.46 9 7.96 8.78 7.58 8.41C7.21 8.03 7 7.53 7 7C7 6.46 7.21 5.96 7.58 5.58C7.96 5.21 8.46 5 9 5ZM15 13C14.11 13 13.25 13.29 12.54 13.83C11.84 14.38 11.34 15.14 11.12 16H3C2.73 16 2.48 16.1 2.29 16.29C2.1 16.48 2 16.73 2 17C2 17.26 2.1 17.51 2.29 17.7C2.48 17.89 2.73 18 3 18H11.12C11.34 18.85 11.84 19.61 12.55 20.16C13.25 20.7 14.11 21 15 21C15.88 21 16.74 20.7 17.44 20.16C18.15 19.61 18.65 18.85 18.87 18H21C21.26 18 21.51 17.89 21.7 17.7C21.89 17.51 22 17.26 22 17C22 16.73 21.89 16.48 21.7 16.29C21.51 16.1 21.26 16 21 16H18.87C18.65 15.14 18.15 14.38 17.45 13.83C16.74 13.29 15.88 13 15 13ZM15 15C15.53 15 16.03 15.21 16.41 15.58C16.78 15.96 17 16.46 17 17C17 17.53 16.78 18.03 16.41 18.41C16.03 18.78 15.53 19 15 19C14.46 19 13.96 18.78 13.58 18.41C13.21 18.03 13 17.53 13 17C13 16.46 13.21 15.96 13.58 15.58C13.96 15.21 14.46 15 15 15Z" fill="white" />
    </svg>
);

const IconVoiceBoost = () => (
    <svg fill="none" height="22" viewBox="0 0 24 24" width="22">
        <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4Zm0 2a2 2 0 0 0-2 2v6a2 2 0 1 0 4 0V5a2 2 0 0 0-2-2Zm-7 8a7 7 0 0 0 13.93 1H21a9 9 0 0 1-17.93 0H5Zm7 9a1 1 0 0 1 1 1v2a1 1 0 1 1-2 0v-2a1 1 0 0 1 1-1Z" fill="white" />
    </svg>
);

const IconSpatialBoost = () => (
    <svg fill="none" height="22" viewBox="0 0 24 24" width="22">
        <path d="M12 11a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm0-1a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" fill="white"/>
        <path d="M8.76 8.76a4.5 4.5 0 0 0 0 6.36l.71-.71a3.5 3.5 0 0 1 0-4.95l-.71-.7zm6.48 0-.71.71a3.5 3.5 0 0 1 0 4.95l.71.71a4.5 4.5 0 0 0 0-6.37z" fill="white"/>
        <path d="M6.34 6.34a7 7 0 0 0 0 9.9l.7-.71a6 6 0 0 1 0-8.48l-.7-.71zm11.32 0-.7.71a6 6 0 0 1 0 8.48l.7.71a7 7 0 0 0 0-9.9z" fill="white"/>
        <path d="M3.93 3.93a10.5 10.5 0 0 0 0 14.85l.7-.7a9.5 9.5 0 0 1 0-13.44l-.7-.71zm16.14 0-.7.71a9.5 9.5 0 0 1 0 13.43l.7.71a10.5 10.5 0 0 0 0-14.85z" fill="white"/>
    </svg>
);

const IconAudioTrack = () => (
    <svg fill="none" height="22" viewBox="0 0 24 24" width="22">
        <path d="M12 3a9 9 0 0 0-9 9v7c0 1.1.9 2 2 2h1c1.1 0 2-.9 2-2v-4c0-1.1-.9-2-2-2H5v-1a7 7 0 0 1 14 0v1h-1c-1.1 0-2 .9-2 2v4c0 1.1.9 2 2 2h1c1.1 0 2-.9 2-2v-7a9 9 0 0 0-9-9z" fill="white" />
    </svg>
);

const IconRainbowBar = () => (
    <svg fill="none" height="22" viewBox="0 0 24 24" width="22">
        <defs>
            <linearGradient id="rbg" x1="0%" x2="100%" y1="0%" y2="0%">
                <stop offset="0%" stopColor="#efa59e" />
                <stop offset="33%" stopColor="#97d6e3" />
                <stop offset="66%" stopColor="#9fb1e8" />
                <stop offset="100%" stopColor="#b9d8ae" />
            </linearGradient>
        </defs>
        <rect x="2" y="10" width="20" height="4" rx="2" fill="url(#rbg)" />
        <circle cx="12" cy="12" r="3" fill="white" />
    </svg>
);

// ── Main component ────────────────────────────────────────────────────────────

export interface SettingsMenuProps {
    open: boolean;
    onClose?: () => void;
    initialView?: View;
    playbackRate: number;
    qualities: Array<{ label: string; level: number }>;
    selectedQuality: number;
    audioTracks: Array<{ label: string; id: number }>;
    selectedAudio: number;
    setRate: (rate: number) => void;
    setQuality: (level: number) => void;
    setAudioTrack: (id: number) => void;
    textTracks: Array<{ label: string; index: number; language?: string }>;
    selectedTrack: number;
    setSubtitleTrack: (index: number) => void;
    scrubberRainbow: boolean;
    toggleScrubberRainbow: () => void;
    ambientMode: boolean;
    toggleAmbientMode: () => void;
    captionStyle?: UseCaptionStyleReturn;
    stableVolume: boolean;
    voiceBoost: boolean;
    spatialBoost: boolean;
    toggleStableVolume: () => void;
    toggleVoiceBoost: () => void;
    toggleSpatialBoost: () => void;
}

export function SettingsMenu({
    open,
    onClose,
    initialView = "main",
    playbackRate,
    qualities,
    selectedQuality,
    audioTracks,
    selectedAudio,
    setRate,
    setQuality,
    setAudioTrack,
    textTracks,
    selectedTrack,
    setSubtitleTrack,
    scrubberRainbow,
    toggleScrubberRainbow,
    ambientMode,
    toggleAmbientMode,
    captionStyle,
    stableVolume,
    voiceBoost,
    spatialBoost,
    toggleStableVolume,
    toggleVoiceBoost,
    toggleSpatialBoost,
}: SettingsMenuProps) {
    const [view, setView] = useState<View>(initialView);
    const [dir, setDir] = useState<Dir>("forward");
    const [annotations, setAnnotations] = useState(true);
    const [sleepTimer, setSleepTimer] = useState(0);
    const [focusedIndex, setFocusedIndex] = useState(0);
    // Local rate drives the speed slider; syncs to playbackRate when entering speed view
    const [localRate, setLocalRate] = useState(playbackRate);
    const [selectedAutoLang, setSelectedAutoLang] = useState<string | null>(null);
    const prevOpen = useRef(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (open && !prevOpen.current) {
            setDir("forward");
            setView(initialView);
            setFocusedIndex(0);
        }
        prevOpen.current = open;
    }, [open, initialView]);

    // Sync localRate to actual playbackRate when entering the speed sub-view
    useEffect(() => {
        if (view === "speed") setLocalRate(playbackRate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [view]);

    useEffect(() => { setFocusedIndex(0); }, [view]);

    const go = (to: View) => { setDir("forward"); setView(to); };
    const back = useCallback(() => {
        setDir("back");
        if (view === "caption-options") setView("subtitles");
        else if (view.startsWith("caption-")) setView("caption-options");
        else if (view === "auto-translate") setView("subtitles");
        else setView("main");
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [view]);
    const backToCaptionOptions = useCallback(() => { setDir("back"); setView("caption-options"); }, []);

    const speedLabel = playbackRate === 1 ? "Normal" : `${playbackRate}x`;
    const selectedQualityItem = qualities.find(q => q.level === selectedQuality);
    const qualityLabel = selectedQualityItem?.label ?? "Auto";
    const subtitleLabel = selectedTrack < 0
        ? "Off"
        : (textTracks[selectedTrack]?.label ?? "On");
    const sleepLabel = SLEEP_OPTIONS.find(o => o.value === sleepTimer)?.label ?? "Off";
    const selectedAudioItem = audioTracks.find(t => t.id === selectedAudio);
    const audioLabel = selectedAudioItem?.label ?? (audioTracks[0]?.label ?? "");

    const toggleRows = [
        { label: "Stable Volume" as React.ReactNode, icon: <IconStableVolume />, on: stableVolume, action: toggleStableVolume },
        { label: "Voice boost" as React.ReactNode, icon: <IconVoiceBoost />, on: voiceBoost, action: toggleVoiceBoost },
        { label: "Spatial boost" as React.ReactNode, icon: <IconSpatialBoost />, on: spatialBoost, action: toggleSpatialBoost },
        { label: "Ambient mode" as React.ReactNode, icon: <IconAmbientMode />, on: ambientMode, action: toggleAmbientMode },
        { label: "Annotations" as React.ReactNode, icon: <IconAnnotations />, on: annotations, action: () => setAnnotations(v => !v) },
        {
            label: (<span style={{ background: "linear-gradient(90deg,#efa59e,#97d6e3,#9fb1e8,#b9d8ae,#f7ceb3)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Rainbow bar</span>) as React.ReactNode,
            icon: <IconRainbowBar />,
            on: scrubberRainbow,
            action: toggleScrubberRainbow,
        },
    ];

    const navRows = [
        ...(audioTracks.length > 1 ? [{
            type: "nav" as const,
            icon: <IconAudioTrack />,
            label: "Audio track" as React.ReactNode,
            right: <NavRight label={audioLabel} />,
            action: () => go("audio"),
        }] : []),
        {
            type: "nav" as const,
            icon: <IconSubtitles />,
            label: (<>Subtitles/CC{textTracks.length > 0 && <span className="text-white/40 ml-1">({textTracks.length})</span>}</>) as React.ReactNode,
            right: <NavRight label={subtitleLabel} />,
            action: () => go("subtitles"),
        },
        {
            type: "nav" as const,
            icon: <IconSleepTimer />,
            label: "Sleep timer" as React.ReactNode,
            right: <NavRight label={sleepLabel} />,
            action: () => go("sleep"),
        },
        {
            type: "nav" as const,
            icon: <IconPlaybackSpeed />,
            label: "Playback speed" as React.ReactNode,
            right: <NavRight label={speedLabel} />,
            action: () => go("speed"),
        },
        ...(qualities.length > 0 ? [{
            type: "nav" as const,
            icon: <IconQuality />,
            label: "Quality" as React.ReactNode,
            right: <NavRight label={qualityLabel} badge={selectedQualityItem ? qualityBadge(qualityLabel) : null} />,
            action: () => go("quality"),
        }] : []),
    ];

    const getItemCount = () => {
        if (view === "main") return toggleRows.length + navRows.length;
        if (view === "speed") return SPEED_CHIPS.length + 1;
        if (view === "quality") return qualities.length;
        if (view === "audio") return audioTracks.length;
        if (view === "subtitles") return textTracks.length + 2;
        if (view === "auto-translate") return AUTO_TRANSLATE_LANGS.length;
        if (view === "sleep") return SLEEP_OPTIONS.length;
        if (view === "caption-options") return 10; // 9 settings + reset
        if (view === "caption-font-family") return CAPTION_FONT_FAMILIES.length;
        if (view === "caption-font-color") return CAPTION_COLORS.length;
        if (view === "caption-font-size") return CAPTION_FONT_SIZES.length;
        if (view === "caption-bg-color") return CAPTION_COLORS.length;
        if (view === "caption-bg-opacity") return CAPTION_OPACITIES.length;
        if (view === "caption-window-color") return CAPTION_COLORS.length;
        if (view === "caption-window-opacity") return CAPTION_OPACITIES.length;
        if (view === "caption-edge-style") return CAPTION_EDGE_STYLES.length;
        if (view === "caption-font-opacity") return CAPTION_OPACITIES.length;
        return 0;
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        const count = getItemCount();
        switch (e.key) {
            case "ArrowDown":
                e.preventDefault();
                e.stopPropagation();
                setFocusedIndex(i => (i + 1) % count);
                break;
            case "ArrowUp":
                e.preventDefault();
                e.stopPropagation();
                setFocusedIndex(i => (i - 1 + count) % count);
                break;
            case "ArrowRight":
                e.preventDefault();
                e.stopPropagation();
                if (view === "main") {
                    const allRows = [
                        ...toggleRows.map(r => ({ type: "toggle" as const, action: r.action })),
                        ...navRows,
                    ];
                    const row = allRows[focusedIndex];
                    if (row?.type === "nav") row.action();
                }
                break;
            case "ArrowLeft":
            case "Escape":
                e.preventDefault();
                e.stopPropagation();
                if (view !== "main") back();
                else onClose?.();
                break;
        }
    };

    // Speed slider helpers
    const stepRate = (dir: 1 | -1) => {
        const idx = PLAYBACK_RATES.indexOf(localRate);
        const next = idx !== -1
            ? PLAYBACK_RATES[Math.max(0, Math.min(PLAYBACK_RATES.length - 1, idx + dir))]!
            : Math.min(SPEED_MAX, Math.max(SPEED_MIN, Math.round((localRate + dir * 0.25) * 20) / 20));
        setLocalRate(next);
        setRate(next);
    };

    const fillPct = ((localRate - SPEED_MIN) / (SPEED_MAX - SPEED_MIN)) * 100;

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    layout
                    initial={{ opacity: 0, y: 8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.96 }}
                    transition={{ duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] }}
                    className="absolute bottom-full rounded-3xl shadow-[0_0_15px_5px_rgba(255,255,255,0.1)] ring ring-white/10 right-0 mb-2 w-[272px] bg-black/92 backdrop-blur-xl overflow-hidden z-50 py-1"
                    onClick={e => e.stopPropagation()}
                    onKeyDown={handleKeyDown}
                    ref={menuRef}
                    role="menu"
                    aria-label="Player settings"
                    tabIndex={-1}
                >
                    <AnimatePresence custom={dir} mode="popLayout">

                        {view === "main" && (
                            <motion.div key="main" custom={dir} variants={variants} initial="enter" animate="center" exit="exit" transition={transition}>
                                {toggleRows.map((row, i) => (
                                    <Row
                                        key={i}
                                        icon={row.icon}
                                        label={row.label}
                                        right={<Toggle on={row.on} />}
                                        onClick={row.action}
                                        focused={focusedIndex === i}
                                    />
                                ))}
                                <div className="border-t border-white/10 my-1" />
                                {navRows.map((row, i) => (
                                    <Row
                                        key={i}
                                        icon={row.icon}
                                        label={row.label}
                                        right={row.right}
                                        onClick={row.action}
                                        focused={focusedIndex === i + toggleRows.length}
                                    />
                                ))}
                            </motion.div>
                        )}

                        {view === "speed" && (
                            <motion.div key="speed" custom={dir} variants={variants} initial="enter" animate="center" exit="exit" transition={transition}>
                                <SubHeader label="Playback speed" onBack={back} />

                                {/* Rate display */}
                                <div className="text-center pt-5 pb-1">
                                    <span className="text-white text-[28px] font-semibold tabular-nums tracking-tight">
                                        {localRate.toFixed(2)}x
                                    </span>
                                    {localRate === 1 && (
                                        <p className="text-white/40 text-[12px] mt-0.5">Normal</p>
                                    )}
                                </div>

                                {/* Slider row */}
                                <div className="flex items-center gap-3 px-5 py-4">
                                    <button
                                        className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-center text-white text-lg font-light flex-none"
                                        onClick={() => stepRate(-1)}
                                        aria-label="Slower"
                                    >
                                        −
                                    </button>

                                    {/* Custom styled slider */}
                                    <div className="relative flex-1 h-9 flex items-center">
                                        {/* Track background */}
                                        <div className="absolute inset-x-0 h-[3px] rounded-full bg-white/20 pointer-events-none">
                                            <div
                                                className="absolute inset-y-0 left-0 bg-white rounded-full"
                                                style={{ width: `${fillPct}%` }}
                                            />
                                        </div>
                                        {/* Thumb */}
                                        <div
                                            className="absolute w-[18px] h-[18px] rounded-full bg-white shadow-md pointer-events-none -translate-x-1/2"
                                            style={{ left: `${fillPct}%` }}
                                        />
                                        {/* Invisible native input on top */}
                                        <input
                                            type="range"
                                            min={SPEED_MIN}
                                            max={SPEED_MAX}
                                            step={0.05}
                                            value={localRate}
                                            onChange={e => {
                                                const v = parseFloat(e.target.value);
                                                setLocalRate(v);
                                                setRate(v);
                                            }}
                                            className="absolute inset-0 w-full opacity-0 cursor-pointer z-10"
                                        />
                                    </div>

                                    <button
                                        className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-center text-white text-lg font-light flex-none"
                                        onClick={() => stepRate(1)}
                                        aria-label="Faster"
                                    >
                                        +
                                    </button>
                                </div>

                                {/* Preset chips */}
                                <div className="flex items-center justify-center gap-1.5 px-4 pb-4 flex-wrap">
                                    {SPEED_CHIPS.map(rate => (
                                        <button
                                            key={rate}
                                            onClick={() => { setLocalRate(rate); setRate(rate); }}
                                            className={cn(
                                                "px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors",
                                                Math.abs(localRate - rate) < 0.01
                                                    ? "bg-twitter2 text-black"
                                                    : "bg-white/10 text-white hover:bg-white/20"
                                            )}
                                        >
                                            {rate === 1 ? "1.0" : rate}x
                                        </button>
                                    ))}
                                </div>
                            </motion.div>
                        )}

                        {view === "quality" && (
                            <motion.div key="quality" custom={dir} variants={variants} initial="enter" animate="center" exit="exit" transition={transition}>
                                <SubHeader label="Quality" onBack={back} />
                                {qualities.map((q, i) => (
                                    <SubRow
                                        key={q.level}
                                        label={q.label}
                                        badge={qualityBadge(q.label)}
                                        selected={q.level === selectedQuality}
                                        onClick={() => setQuality(q.level)}
                                        focused={focusedIndex === i}
                                    />
                                ))}
                            </motion.div>
                        )}

                        {view === "audio" && (
                            <motion.div key="audio" custom={dir} variants={variants} initial="enter" animate="center" exit="exit" transition={transition}>
                                <SubHeader label="Audio track" onBack={back} />
                                {audioTracks.map((t, i) => (
                                    <SubRow
                                        key={t.id}
                                        label={t.label}
                                        selected={t.id === selectedAudio}
                                        onClick={() => setAudioTrack(t.id)}
                                        focused={focusedIndex === i}
                                    />
                                ))}
                            </motion.div>
                        )}

                        {view === "subtitles" && (
                            <motion.div key="subtitles" custom={dir} variants={variants} initial="enter" animate="center" exit="exit" transition={transition}>
                                <SubHeader
                                    label="Subtitles/CC"
                                    onBack={back}
                                    right={
                                        captionStyle ? (
                                            <button
                                                className="text-white/50 hover:text-white text-[13px] px-2 transition-colors"
                                                onClick={() => go("caption-options")}
                                            >
                                                Options
                                            </button>
                                        ) : undefined
                                    }
                                />
                                <SubRow
                                    label="Off"
                                    selected={selectedTrack < 0}
                                    onClick={() => setSubtitleTrack(-1)}
                                    focused={focusedIndex === 0}
                                />
                                {textTracks.map((t, i) => (
                                    <SubRow
                                        key={t.index}
                                        label={t.label}
                                        badge={t.language ? t.language.slice(0, 2).toUpperCase() : null}
                                        selected={i === selectedTrack}
                                        onClick={() => setSubtitleTrack(t.index)}
                                        focused={focusedIndex === i + 1}
                                    />
                                ))}
                                {/* Auto-translate nav row */}
                                <div
                                    role="menuitem"
                                    tabIndex={focusedIndex === textTracks.length + 1 ? 0 : -1}
                                    className={cn(
                                        "flex items-center justify-between px-4 py-[10px] cursor-pointer transition-colors select-none outline-none",
                                        focusedIndex === textTracks.length + 1 ? "bg-white/15" : "hover:bg-white/10"
                                    )}
                                    onClick={() => go("auto-translate")}
                                    onKeyDown={e => (e.key === "Enter" || e.key === " " || e.key === "ArrowRight") && go("auto-translate")}
                                >
                                    <span className="text-[14px] text-white">Auto-translate</span>
                                    <div className="flex items-center gap-1.5 text-white/55 text-[13px]">
                                        {selectedAutoLang && <span>{selectedAutoLang}</span>}
                                        <ChevronRight size={15} className="opacity-70" />
                                    </div>
                                </div>
                                {/* Footer note */}
                                <div className="px-4 py-3 border-t border-white/10 mt-1">
                                    <p className="text-white/40 text-[11.5px] leading-snug">
                                        This setting only applies to the current video.
                                    </p>
                                </div>
                            </motion.div>
                        )}

                        {view === "auto-translate" && (
                            <motion.div key="auto-translate" custom={dir} variants={variants} initial="enter" animate="center" exit="exit" transition={transition}>
                                <SubHeader label="Auto-translate" onBack={back} />
                                <div className="overflow-y-auto max-h-[320px]">
                                    {AUTO_TRANSLATE_LANGS.map((lang, i) => (
                                        <SubRow
                                            key={lang}
                                            label={lang}
                                            selected={lang === selectedAutoLang}
                                            onClick={() => {
                                                setSelectedAutoLang(lang === selectedAutoLang ? null : lang);
                                                back();
                                            }}
                                            focused={focusedIndex === i}
                                        />
                                    ))}
                                </div>
                                <div className="px-4 py-3 border-t border-white/10">
                                    <p className="text-white/40 text-[11.5px] leading-snug">
                                        Edit your preferred languages in settings.
                                    </p>
                                </div>
                            </motion.div>
                        )}

                        {view === "sleep" && (
                            <motion.div key="sleep" custom={dir} variants={variants} initial="enter" animate="center" exit="exit" transition={transition}>
                                <SubHeader label="Sleep timer" onBack={back} />
                                {SLEEP_OPTIONS.map((o, i) => (
                                    <SubRow
                                        key={o.value}
                                        label={o.label}
                                        selected={o.value === sleepTimer}
                                        onClick={() => setSleepTimer(o.value)}
                                        focused={focusedIndex === i}
                                    />
                                ))}
                            </motion.div>
                        )}

                        {view === "caption-options" && captionStyle && (
                            <motion.div key="caption-options" custom={dir} variants={variants} initial="enter" animate="center" exit="exit" transition={transition}>
                                <SubHeader label="Caption options" onBack={back} />
                                <Row
                                    label="Font family"
                                    right={<NavRight label={FONT_FAMILY_LABELS[captionStyle.style.fontFamily]} />}
                                    onClick={() => go("caption-font-family")}
                                    focused={focusedIndex === 0}
                                />
                                <Row
                                    label="Font color"
                                    right={
                                        <div className="flex items-center gap-2 text-white/55 text-[13px]">
                                            <div className="w-4 h-4 rounded-full ring-1 ring-white/30" style={{ background: hexWithOpacity(captionStyle.style.fontColor, captionStyle.style.fontOpacity) }} />
                                            <span>{COLOR_LABELS[captionStyle.style.fontColor]}</span>
                                            <ChevronRight size={15} className="opacity-70" />
                                        </div>
                                    }
                                    onClick={() => go("caption-font-color")}
                                    focused={focusedIndex === 1}
                                />
                                <Row
                                    label="Font size"
                                    right={<NavRight label={`${captionStyle.style.fontSize}%`} />}
                                    onClick={() => go("caption-font-size")}
                                    focused={focusedIndex === 2}
                                />
                                <Row
                                    label="Background color"
                                    right={
                                        <div className="flex items-center gap-2 text-white/55 text-[13px]">
                                            <div className="w-4 h-4 rounded-full ring-1 ring-white/30" style={{ background: hexWithOpacity(captionStyle.style.bgColor, captionStyle.style.bgOpacity) }} />
                                            <span>{COLOR_LABELS[captionStyle.style.bgColor]}</span>
                                            <ChevronRight size={15} className="opacity-70" />
                                        </div>
                                    }
                                    onClick={() => go("caption-bg-color")}
                                    focused={focusedIndex === 3}
                                />
                                <Row
                                    label="Background opacity"
                                    right={<NavRight label={`${captionStyle.style.bgOpacity}%`} />}
                                    onClick={() => go("caption-bg-opacity")}
                                    focused={focusedIndex === 4}
                                />
                                <Row
                                    label="Window color"
                                    right={
                                        <div className="flex items-center gap-2 text-white/55 text-[13px]">
                                            <div className="w-4 h-4 rounded-full ring-1 ring-white/30" style={{ background: hexWithOpacity(captionStyle.style.windowColor, captionStyle.style.windowOpacity) }} />
                                            <span>{COLOR_LABELS[captionStyle.style.windowColor]}</span>
                                            <ChevronRight size={15} className="opacity-70" />
                                        </div>
                                    }
                                    onClick={() => go("caption-window-color")}
                                    focused={focusedIndex === 5}
                                />
                                <Row
                                    label="Window opacity"
                                    right={<NavRight label={`${captionStyle.style.windowOpacity}%`} />}
                                    onClick={() => go("caption-window-opacity")}
                                    focused={focusedIndex === 6}
                                />
                                <Row
                                    label="Character edge style"
                                    right={<NavRight label={captionStyle.style.edgeStyle === "drop-shadow" ? "Drop shadow" : captionStyle.style.edgeStyle.charAt(0).toUpperCase() + captionStyle.style.edgeStyle.slice(1)} />}
                                    onClick={() => go("caption-edge-style")}
                                    focused={focusedIndex === 7}
                                />
                                <Row
                                    label="Font opacity"
                                    right={<NavRight label={`${captionStyle.style.fontOpacity}%`} />}
                                    onClick={() => go("caption-font-opacity")}
                                    focused={focusedIndex === 8}
                                />
                                <div className="border-t border-white/10 my-1" />
                                <Row
                                    label={<span className="text-white/60">Reset to default</span>}
                                    onClick={() => { captionStyle.reset(); back(); }}
                                    focused={focusedIndex === 9}
                                />
                            </motion.div>
                        )}

                        {view === "caption-font-family" && captionStyle && (
                            <motion.div key="caption-font-family" custom={dir} variants={variants} initial="enter" animate="center" exit="exit" transition={transition}>
                                <SubHeader label="Font family" onBack={back} />
                                {CAPTION_FONT_FAMILIES.map((ff, i) => (
                                    <SubRow
                                        key={ff.value}
                                        label={ff.label}
                                        selected={ff.value === captionStyle.style.fontFamily}
                                        onClick={() => { captionStyle.update("fontFamily", ff.value); backToCaptionOptions(); }}
                                        focused={focusedIndex === i}
                                    />
                                ))}
                            </motion.div>
                        )}

                        {view === "caption-font-color" && captionStyle && (
                            <motion.div key="caption-font-color" custom={dir} variants={variants} initial="enter" animate="center" exit="exit" transition={transition}>
                                <SubHeader label="Font color" onBack={back} />
                                {CAPTION_COLORS.map((c, i) => (
                                    <div
                                        key={c.value}
                                        role="menuitemradio"
                                        aria-checked={c.value === captionStyle.style.fontColor}
                                        tabIndex={focusedIndex === i ? 0 : -1}
                                        className={cn(
                                            "flex items-center justify-between px-4 py-[10px] cursor-pointer transition-colors select-none outline-none",
                                            focusedIndex === i ? "bg-white/15" : "hover:bg-white/10"
                                        )}
                                        onClick={() => { captionStyle.update("fontColor", c.value); backToCaptionOptions(); }}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-5 h-5 rounded-full ring-1 ring-white/30 flex-none" style={{ background: c.hex }} />
                                            <span className={cn("text-[14px]", c.value === captionStyle.style.fontColor ? "text-twitter2 font-medium" : "text-white")}>{COLOR_LABELS[c.value]}</span>
                                        </div>
                                        <AnimatePresence>
                                            {c.value === captionStyle.style.fontColor && (
                                                <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }} transition={{ duration: 0.15 }}>
                                                    <Check size={15} className="text-twitter2" />
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                ))}
                            </motion.div>
                        )}

                        {view === "caption-font-size" && captionStyle && (
                            <motion.div key="caption-font-size" custom={dir} variants={variants} initial="enter" animate="center" exit="exit" transition={transition}>
                                <SubHeader label="Font size" onBack={back} />
                                {CAPTION_FONT_SIZES.map((fs, i) => (
                                    <SubRow
                                        key={fs.value}
                                        label={fs.label}
                                        selected={fs.value === captionStyle.style.fontSize}
                                        onClick={() => { captionStyle.update("fontSize", fs.value); backToCaptionOptions(); }}
                                        focused={focusedIndex === i}
                                    />
                                ))}
                            </motion.div>
                        )}

                        {view === "caption-bg-color" && captionStyle && (
                            <motion.div key="caption-bg-color" custom={dir} variants={variants} initial="enter" animate="center" exit="exit" transition={transition}>
                                <SubHeader label="Background color" onBack={back} />
                                {CAPTION_COLORS.map((c, i) => (
                                    <div
                                        key={c.value}
                                        role="menuitemradio"
                                        aria-checked={c.value === captionStyle.style.bgColor}
                                        tabIndex={focusedIndex === i ? 0 : -1}
                                        className={cn(
                                            "flex items-center justify-between px-4 py-[10px] cursor-pointer transition-colors select-none outline-none",
                                            focusedIndex === i ? "bg-white/15" : "hover:bg-white/10"
                                        )}
                                        onClick={() => { captionStyle.update("bgColor", c.value); backToCaptionOptions(); }}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-5 h-5 rounded-full ring-1 ring-white/30 flex-none" style={{ background: c.hex }} />
                                            <span className={cn("text-[14px]", c.value === captionStyle.style.bgColor ? "text-twitter2 font-medium" : "text-white")}>{COLOR_LABELS[c.value]}</span>
                                        </div>
                                        <AnimatePresence>
                                            {c.value === captionStyle.style.bgColor && (
                                                <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }} transition={{ duration: 0.15 }}>
                                                    <Check size={15} className="text-twitter2" />
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                ))}
                            </motion.div>
                        )}

                        {view === "caption-bg-opacity" && captionStyle && (
                            <motion.div key="caption-bg-opacity" custom={dir} variants={variants} initial="enter" animate="center" exit="exit" transition={transition}>
                                <SubHeader label="Background opacity" onBack={back} />
                                {CAPTION_OPACITIES.map((o, i) => (
                                    <SubRow
                                        key={o.value}
                                        label={o.label}
                                        selected={o.value === captionStyle.style.bgOpacity}
                                        onClick={() => { captionStyle.update("bgOpacity", o.value); backToCaptionOptions(); }}
                                        focused={focusedIndex === i}
                                    />
                                ))}
                            </motion.div>
                        )}

                        {view === "caption-window-color" && captionStyle && (
                            <motion.div key="caption-window-color" custom={dir} variants={variants} initial="enter" animate="center" exit="exit" transition={transition}>
                                <SubHeader label="Window color" onBack={back} />
                                {CAPTION_COLORS.map((c, i) => (
                                    <div
                                        key={c.value}
                                        role="menuitemradio"
                                        aria-checked={c.value === captionStyle.style.windowColor}
                                        tabIndex={focusedIndex === i ? 0 : -1}
                                        className={cn(
                                            "flex items-center justify-between px-4 py-[10px] cursor-pointer transition-colors select-none outline-none",
                                            focusedIndex === i ? "bg-white/15" : "hover:bg-white/10"
                                        )}
                                        onClick={() => { captionStyle.update("windowColor", c.value); backToCaptionOptions(); }}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-5 h-5 rounded-full ring-1 ring-white/30 flex-none" style={{ background: c.hex }} />
                                            <span className={cn("text-[14px]", c.value === captionStyle.style.windowColor ? "text-twitter2 font-medium" : "text-white")}>{COLOR_LABELS[c.value]}</span>
                                        </div>
                                        <AnimatePresence>
                                            {c.value === captionStyle.style.windowColor && (
                                                <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }} transition={{ duration: 0.15 }}>
                                                    <Check size={15} className="text-twitter2" />
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                ))}
                            </motion.div>
                        )}

                        {view === "caption-window-opacity" && captionStyle && (
                            <motion.div key="caption-window-opacity" custom={dir} variants={variants} initial="enter" animate="center" exit="exit" transition={transition}>
                                <SubHeader label="Window opacity" onBack={back} />
                                {CAPTION_OPACITIES.map((o, i) => (
                                    <SubRow
                                        key={o.value}
                                        label={o.label}
                                        selected={o.value === captionStyle.style.windowOpacity}
                                        onClick={() => { captionStyle.update("windowOpacity", o.value); backToCaptionOptions(); }}
                                        focused={focusedIndex === i}
                                    />
                                ))}
                            </motion.div>
                        )}

                        {view === "caption-edge-style" && captionStyle && (
                            <motion.div key="caption-edge-style" custom={dir} variants={variants} initial="enter" animate="center" exit="exit" transition={transition}>
                                <SubHeader label="Character edge style" onBack={back} />
                                {CAPTION_EDGE_STYLES.map((es, i) => (
                                    <SubRow
                                        key={es.value}
                                        label={es.label}
                                        selected={es.value === captionStyle.style.edgeStyle}
                                        onClick={() => { captionStyle.update("edgeStyle", es.value); backToCaptionOptions(); }}
                                        focused={focusedIndex === i}
                                    />
                                ))}
                            </motion.div>
                        )}

                        {view === "caption-font-opacity" && captionStyle && (
                            <motion.div key="caption-font-opacity" custom={dir} variants={variants} initial="enter" animate="center" exit="exit" transition={transition}>
                                <SubHeader label="Font opacity" onBack={back} />
                                {CAPTION_OPACITIES.map((o, i) => (
                                    <SubRow
                                        key={o.value}
                                        label={o.label}
                                        selected={o.value === captionStyle.style.fontOpacity}
                                        onClick={() => { captionStyle.update("fontOpacity", o.value); backToCaptionOptions(); }}
                                        focused={focusedIndex === i}
                                    />
                                ))}
                            </motion.div>
                        )}

                    </AnimatePresence>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

// SubtitlesMenu kept as a thin redirect into SettingsMenu for the CC button
export interface SubtitlesMenuProps {
    open: boolean;
    onClose?: () => void;
    textTracks: Array<{ label: string; index: number; language?: string }>;
    selectedTrack: number;
    setSubtitleTrack: (index: number) => void;
}

export function SubtitlesMenu({ open, onClose, textTracks, selectedTrack, setSubtitleTrack }: SubtitlesMenuProps) {
    return (
        <SettingsMenu
            open={open}
            onClose={onClose}
            initialView="subtitles"
            playbackRate={1}
            qualities={[]}
            selectedQuality={-1}
            audioTracks={[]}
            selectedAudio={-1}
            setRate={() => {}}
            setQuality={() => {}}
            setAudioTrack={() => {}}
            textTracks={textTracks}
            selectedTrack={selectedTrack}
            setSubtitleTrack={setSubtitleTrack}
            scrubberRainbow={false}
            toggleScrubberRainbow={() => {}}
            ambientMode={false}
            toggleAmbientMode={() => {}}
            stableVolume={false}
            voiceBoost={false}
            spatialBoost={false}
            toggleStableVolume={() => {}}
            toggleVoiceBoost={() => {}}
            toggleSpatialBoost={() => {}}
        />
    );
}
