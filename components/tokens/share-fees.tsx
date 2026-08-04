"use client";

import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Delete02Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Squircle } from "@/components/ui/squircle";
import { XIcon, KickIcon, TwitchIcon, SolanaIcon, AtIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import type { SplitShare } from "@/components/app-ui/create-dialog/token-launch-section";

// "Share fees" — split a coin's creator fees with up to 5 accounts.
//
// Lifted out of ticker-edit-dialog, which had it twice (the create-dialog copy
// and the browse copy) while the standalone coin tab had NO fee sharing at all
// — coin-composer just sent `splits: []`. Launching a coin from the Post tab and
// launching one from the Coin tab produced different products, which isn't a
// design decision anyone made.
//
// Controlled: the parent owns `splits` so it can put them in the launch payload.
// Everything else — the add/remove/redistribute rules and the 5-earner cap —
// lives here, because those ARE the component.
const MAX_SPLITS = 5;

const PLATFORMS = [
    { icon: XIcon, id: "twitter" },
    { icon: KickIcon, id: "kick" },
    { icon: TwitchIcon, id: "twitch" },
    { icon: SolanaIcon, id: "solana" },
    { icon: AtIcon, id: "site" },
] as const;

export function ShareFees({
    splits,
    onChange,
}: {
    splits: SplitShare[];
    onChange: (splits: SplitShare[]) => void;
}) {
    const addSplit = () => {
        if (splits.length >= MAX_SPLITS) return;
        onChange([...splits, { address: "", percentage: 0, platform: "site" }]);
    };

    const removeSplit = (index: number) => {
        const next = [...splits];
        next.splice(index, 1);
        onChange(next);
    };

    const updateSplit = (index: number, updates: Partial<SplitShare>) => {
        const next = [...splits];
        next[index] = { ...next[index], ...updates };
        onChange(next);
    };

    // +1 for the creator: an equal split is between the earners AND you.
    const splitEqually = () => {
        if (splits.length === 0) return;
        const equalShare = Number((100 / (splits.length + 1)).toFixed(2));
        onChange(splits.map((s) => ({ ...s, percentage: equalShare })));
    };

    const totalSplitPercentage = splits.reduce((acc, curr) => acc + (curr.percentage || 0), 0);
    const creatorShare = Math.max(0, 100 - totalSplitPercentage);

    return (
        <Squircle asChild radius={24} autoEffects={false}>
            <div className="space-y-5 p-6 bg-panel mb-6">
                <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                        <Label className="text-[15px] font-semibold text-white">Share fees (optional)</Label>
                        <p className="text-[13px] text-zinc-500">Share fees with up to 5 accounts.</p>
                    </div>
                    <Switch
                        checked={splits.length > 0}
                        onCheckedChange={(checked) => {
                            if (checked && splits.length === 0) {
                                onChange([{ address: "", percentage: 10, platform: "site" }]);
                            }
                            if (!checked) onChange([]);
                        }}
                    />
                </div>

                <div className="flex items-center justify-between px-1">
                    <span className="text-[13px] font-semibold text-zinc-400">Your share</span>
                    <span className="text-[15px] font-bold tabular-nums text-white">{creatorShare.toFixed(2)}%</span>
                </div>

                <AnimatePresence>
                    {splits.map((split, index) => (
                        <motion.div
                            key={index}
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="pt-2"
                        >
                            <Squircle asChild radius={20} autoEffects={false}>
                                <div className="bg-white/[0.04] p-5 space-y-4 relative">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[14px] font-semibold text-white">Fee earner #{index + 1}</span>
                                        <button
                                            onClick={() => removeSplit(index)}
                                            className="group rounded-full p-2 transition-colors hover:bg-pastelred/10"
                                        >
                                            <HugeiconsIcon
                                                icon={Delete02Icon}
                                                className="size-4 text-zinc-600 transition-colors group-hover:text-pastelred"
                                                strokeWidth={2}
                                            />
                                        </button>
                                    </div>

                                    <div className="flex gap-2">
                                        {PLATFORMS.map((platformItem, i) => {
                                            const Icon = platformItem.icon;
                                            const isActive = split.platform === platformItem.id;
                                            return (
                                                <div
                                                    key={i}
                                                    onClick={() => updateSplit(index, { platform: platformItem.id })}
                                                    className={cn(
                                                        "flex size-10 cursor-pointer items-center justify-center rounded-full transition-all active:scale-95",
                                                        isActive
                                                            ? "bg-white text-black"
                                                            : "bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white",
                                                    )}
                                                >
                                                    <Icon className="w-5 h-5" />
                                                </div>
                                            );
                                        })}
                                    </div>

                                    <Input
                                        radius={14}
                                        value={split.address}
                                        onChange={(e) => updateSplit(index, { address: e.target.value })}
                                        placeholder={split.platform === "solana" ? "Wallet address" : "@username"}
                                        className="h-12 text-[13px]"
                                    />

                                    <div className="flex items-center justify-between pt-1">
                                        <span className="text-[12px] font-medium text-zinc-500">Fee percentage</span>
                                        <span className="text-[13px] font-semibold tabular-nums text-white">
                                            {split.percentage.toFixed(2)}%
                                        </span>
                                    </div>

                                    <div className="flex gap-2">
                                        {[1, 10, 50, 100].map((p) => (
                                            <button
                                                key={p}
                                                onClick={() => updateSplit(index, { percentage: p })}
                                                className="flex-1 rounded-full bg-white/5 py-1.5 text-[12px] font-semibold text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
                                            >
                                                {p}%
                                            </button>
                                        ))}
                                        <div className="flex-1 flex items-center relative">
                                            <Input
                                                radius={12}
                                                type="number"
                                                value={split.percentage === 0 ? "" : split.percentage}
                                                onChange={(e) =>
                                                    updateSplit(index, {
                                                        percentage: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)),
                                                    })
                                                }
                                                placeholder="Custom"
                                                className="h-8 w-full px-2 text-center text-[12px] font-medium"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </Squircle>
                        </motion.div>
                    ))}
                </AnimatePresence>

                <div className="pt-2">
                    <div className="flex items-center justify-between mb-2">
                        <div className="space-y-0.5">
                            <Label className="text-[13px] font-semibold text-white">Split fees equally</Label>
                            <p className="text-[12px] text-zinc-500">Distribute fees evenly across all earners</p>
                        </div>
                        <Switch onClick={splitEqually} />
                    </div>
                </div>

                {splits.length > 0 && splits.length < MAX_SPLITS && (
                    <Button
                        variant="ghost"
                        className="h-12 w-full rounded-full bg-white/5 text-[13px] font-semibold text-zinc-400 hover:bg-white/10 hover:text-white"
                        onClick={addSplit}
                    >
                        <HugeiconsIcon icon={PlusSignIcon} className="mr-1 size-4" strokeWidth={2} />
                        Add fee earner (max {MAX_SPLITS})
                    </Button>
                )}
            </div>
        </Squircle>
    );
}
