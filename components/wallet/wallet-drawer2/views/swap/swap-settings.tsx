"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon, ArrowRight01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import * as React from "react";
import { motion, AnimatePresence, type Variants } from "motion/react";
import { SettingsIcon, TradeIcon } from "@/components/icons";
import Image from "next/image";

export interface SwapSettings {
    slippage: "auto" | number;
    deadline: number;
    tradeRoute: "default"; // extensible later
}

interface SwapSettingsPanelProps {
    settings: SwapSettings;
    onChange: (s: SwapSettings) => void;
}

const SLIPPAGE_PRESETS = ["auto", "0.1", "0.5", "1.0"] as const;
const DEADLINE_PRESETS = [10, 20, 30] as const;

// Panel slide variants
const panelVariants: Variants = {
    enter: (dir: number) => ({ opacity: 0, x: dir > 0 ? 24 : -24 }),
    center: { opacity: 1, x: 0 },
    exit: (dir: number) => ({ opacity: 0, x: dir > 0 ? -24 : 24 }),
};

const JUPITER_LOGO = "https://static.jup.ag/jup/icon.png";

export function SwapSettingsPanel({ settings, onChange }: SwapSettingsPanelProps) {
    const [open, setOpen] = React.useState(false);
    const [view, setView] = React.useState<"main" | "trade">("main");
    const [direction, setDirection] = React.useState(1);
    const [customSlippage, setCustomSlippage] = React.useState("");
    const [customDeadline, setCustomDeadline] = React.useState("");
    const panelRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        if (!open) return;
        const handleClick = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                setOpen(false);
                setView("main");
            }
        };
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [open]);

    const navigate = (target: "main" | "trade") => {
        setDirection(target === "trade" ? 1 : -1);
        setView(target);
    };

    const handleSlippagePreset = (val: string) => {
        setCustomSlippage("");
        onChange({ ...settings, slippage: val === "auto" ? "auto" : parseFloat(val) });
    };

    const handleCustomSlippage = (val: string) => {
        setCustomSlippage(val);
        const n = parseFloat(val);
        if (!isNaN(n) && n >= 0 && n <= 50) onChange({ ...settings, slippage: n });
    };

    const handleDeadlinePreset = (val: number) => {
        setCustomDeadline("");
        onChange({ ...settings, deadline: val });
    };

    const handleCustomDeadline = (val: string) => {
        setCustomDeadline(val);
        const n = parseInt(val, 10);
        if (!isNaN(n) && n > 0) onChange({ ...settings, deadline: n });
    };

    const isSlippagePreset = (val: string) => {
        if (val === "auto" && settings.slippage === "auto" && !customSlippage) return true;
        if (val !== "auto" && settings.slippage !== "auto" && !customSlippage && settings.slippage === parseFloat(val)) return true;
        return false;
    };

    const slippageLabel = settings.slippage === "auto" ? "Auto" : `${settings.slippage}%`;

    return (
        <div ref={panelRef} className="relative">
            {/* Gear trigger */}
            <button
                onClick={() => { setOpen(v => !v); setView("main"); }}
                className={`cursor-pointer p-1.5 rounded-full transition-all duration-150 ${open ? "bg-white/[0.12] text-white" : "text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.08]"
                    }`}
                aria-label="Swap settings"
            >
                <SettingsIcon className="w-[18px] h-[18px]" />
            </button>

            <AnimatePresence>
                {open && (
                    <motion.div
                        key="panel-shell"
                        initial={{ opacity: 0, scale: 0.95, y: -6 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -6 }}
                        transition={{ type: "spring", stiffness: 420, damping: 30 }}
                        className="absolute right-0 top-full mt-2.5 w-[290px] z-50 bg-panel2 border border-baseborder/20 rounded-3xl overflow-hidden"
                    >
                        {/* Inner animated view */}
                        <AnimatePresence mode="popLayout" custom={direction} initial={false}>
                            {view === "main" ? (
                                <motion.div
                                    key="main"
                                    custom={direction}
                                    variants={panelVariants}
                                    initial="enter"
                                    animate="center"
                                    exit="exit"
                                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                                >
                                    {/* Max Slippage */}
                                    <div className="px-5 pt-5 pb-4 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <span className="text-13 font-semibold text-zinc-200">Max slippage</span>
                                            <span className="text-12 font-medium text-zinc-400">{slippageLabel}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            {SLIPPAGE_PRESETS.map(preset => (
                                                <button
                                                    key={preset}
                                                    onClick={() => handleSlippagePreset(preset)}
                                                    className={`cursor-pointer flex-1 py-1.5 rounded-full text-11 font-semibold transition-all duration-150 ${isSlippagePreset(preset)
                                                            ? "bg-zinc-200 text-zinc-900"
                                                            : "bg-white/[0.06] text-zinc-400 hover:bg-white/[0.14] hover:text-zinc-200"
                                                        }`}
                                                >
                                                    {preset === "auto" ? "Auto" : `${preset}%`}
                                                </button>
                                            ))}
                                            <div className="relative flex-1">
                                                <input
                                                    type="number" min="0" max="50" step="0.1" placeholder="—"
                                                    value={customSlippage}
                                                    onChange={e => handleCustomSlippage(e.target.value)}
                                                    className={`cursor-text w-full py-1.5 rounded-full text-11 font-semibold text-center outline-none transition-colors duration-150 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${customSlippage
                                                            ? "bg-white text-black"
                                                            : "bg-white/[0.06] text-zinc-400 hover:bg-white/[0.14] hover:text-zinc-200"
                                                        }`}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    

                                    {/* Swap Deadline */}
                                    <div className="px-5 pt-4 pb-4 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <span className="text-13 font-semibold text-zinc-200">Swap deadline</span>
                                            <span className="text-12 font-medium text-zinc-400">{customDeadline || settings.deadline} min</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            {DEADLINE_PRESETS.map(val => (
                                                <button
                                                    key={val}
                                                    onClick={() => handleDeadlinePreset(val)}
                                                    className={`cursor-pointer flex-1 py-1.5 rounded-full text-11 font-semibold transition-all duration-150 ${settings.deadline === val && !customDeadline
                                                            ? "bg-zinc-200 text-zinc-900"
                                                            : "bg-white/[0.06] text-zinc-400 hover:bg-white/[0.14] hover:text-zinc-200"
                                                        }`}
                                                >
                                                    {val}m
                                                </button>
                                            ))}
                                            <div className="relative flex-1">
                                                <input
                                                    type="number" min="1" max="4320" step="1" placeholder="—"
                                                    value={customDeadline}
                                                    onChange={e => handleCustomDeadline(e.target.value)}
                                                    className={`cursor-text w-full py-1.5 rounded-full text-11 font-semibold text-center outline-none transition-colors duration-150 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${customDeadline
                                                            ? "bg-white text-black"
                                                            : "bg-white/[0.06] text-zinc-400 hover:bg-white/[0.14] hover:text-zinc-200"
                                                        }`}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    

                                    {/* Trade Options nav row */}
                                    <button
                                        onClick={() => navigate("trade")}
                                        className="cursor-pointer w-full px-5 py-4 flex items-center justify-between hover:bg-white/[0.04] transition-colors"
                                    >
                                        <span className="text-13 font-semibold text-zinc-200">Trade options</span>
                                        <div className="flex items-center gap-1.5 text-zinc-400">
                                            <span className="text-12 font-medium">Default</span>
                                            <HugeiconsIcon icon={ArrowRight01Icon} className="w-3.5 h-3.5" />
                                        </div>
                                    </button>
                                </motion.div>
                            ) : (
                                <motion.div
                                    key="trade"
                                    custom={direction}
                                    variants={panelVariants}
                                    initial="enter"
                                    animate="center"
                                    exit="exit"
                                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                                >
                                    {/* Trade Options header */}
                                    <div className="flex h-14 items-center gap-2 px-4">
                                        <button
                                            onClick={() => navigate("main")}
                                            className="cursor-pointer p-1 rounded-full text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.08] transition-colors"
                                        >
                                            <HugeiconsIcon icon={ArrowLeft01Icon} className="w-4 h-4" />
                                        </button>
                                        <span className="text-13 font-semibold text-zinc-200">Trade options</span>
                                    </div>

                                    {/* Default routing option */}
                                    <div className="px-5 py-4 space-y-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="space-y-1 flex-1">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-13 font-semibold text-zinc-200">Default</span>
                                                    <div className="w-3.5 h-3.5 rounded-full bg-white/[0.08] flex items-center justify-center flex-shrink-0">
                                                        <span className="text-zinc-400 text-[9px] font-bold leading-none">i</span>
                                                    </div>
                                                </div>
                                                <p className="text-11 text-zinc-500 leading-relaxed">
                                                    Identifies the most efficient route for your swap.
                                                </p>
                                            </div>
                                            {/* Toggle — always on for now (Default is the only mode) */}
                                            <div className="flex-shrink-0 mt-0.5">
                                                <div className="w-11 h-6 bg-zinc-200 rounded-full flex items-center justify-end pr-0.5 shadow-inner">
                                                    <div className="w-5 h-5 bg-panel2 rounded-full flex items-center justify-center shadow">
                                                        <HugeiconsIcon icon={Tick02Icon} className="w-3 h-3 text-zinc-200" />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
