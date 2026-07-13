"use client"

import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Delete02Icon, PlusSignIcon } from "@hugeicons/core-free-icons"
import { XIcon, KickIcon, TwitchIcon, SolanaIcon, AtIcon, TelegramIcon, GlobeIcon } from "@/components/icons"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { AnimatedSlider } from "@/components/ui/motion-slider"
import * as VisuallyHidden from "@radix-ui/react-visually-hidden"
import { TokenLaunchState, SplitShare } from "./token-launch-section"
import { AnimatePresence, motion } from "framer-motion"
import { Squircle } from "@/components/ui/squircle"
import { cn } from "@/lib/utils"

interface TickerEditDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    state: TokenLaunchState
    onSave: (updates: Partial<TokenLaunchState>) => void
}

export function TickerEditDialog({ open, onOpenChange, state, onSave }: TickerEditDialogProps) {
    const [localState, setLocalState] = React.useState(state)
    const [splits, setSplits] = React.useState<SplitShare[]>(state.splits || [])

    React.useEffect(() => {
        if (open) {
            setLocalState(state)
            setSplits(state.splits || [])
        }
    }, [open, state])

    const updateState = (updates: Partial<TokenLaunchState>) => {
        setLocalState(prev => ({ ...prev, ...updates }))
    }

    const handleSave = () => {
        updateState({ splits })
        onSave({ ...localState, splits })
        onOpenChange(false)
    }

    const handleClose = () => {
        handleSave()
    }

    const addSplit = () => {
        if (splits.length >= 5) return;
        setSplits([...splits, { address: "", percentage: 0, platform: "site" }])
    }

    const removeSplit = (index: number) => {
        const newSplits = [...splits]
        newSplits.splice(index, 1)
        setSplits(newSplits)
    }

    const updateSplit = (index: number, updates: Partial<SplitShare>) => {
        const newSplits = [...splits]
        newSplits[index] = { ...newSplits[index], ...updates }
        setSplits(newSplits)
    }

    const splitEqually = () => {
        if (splits.length === 0) return;
        const equalShare = Number((100 / (splits.length + 1)).toFixed(2));
        const newSplits = splits.map(s => ({ ...s, percentage: equalShare }));
        setSplits(newSplits);
    }

    const totalSplitPercentage = splits.reduce((acc, curr) => acc + (curr.percentage || 0), 0);
    const creatorShare = Math.max(0, 100 - totalSplitPercentage);


    const autoGenerateTicker = () => {
        // Placeholder for auto-generation logic
        const newTicker = "AUTO" + Math.floor(Math.random() * 1000);
        updateState({ ticker: newTicker, isTickerManuallyEdited: false });
    };

    return (
        <Dialog open={open} onOpenChange={(isOpen) => isOpen ? onOpenChange(true) : handleClose()}>
            <DialogContent className="sm:max-w-[500px] border-zinc-800 p-0 gap-0 top-[50%] overflow-hidden flex flex-col max-h-[85vh] rounded-[32px]">
                <VisuallyHidden.Root>
                    <DialogTitle>Edit Ticker</DialogTitle>
                </VisuallyHidden.Root>

                {/* Header */}
                <div className="flex items-center justify-between p-6 pb-0 shrink-0">
                    <div className="w-7" />
                    <div className="flex flex-col items-center">
                        <h2 className="text-lg font-semibold text-white">Edit Ticker</h2>
                        {state.ticker !== localState.ticker && (
                            <span className="text-[11px] font-medium text-zinc-500">Unsaved changes</span>
                        )}
                    </div>
                    <div className="w-7" />
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto px-6 pt-6 pb-24 space-y-8 custom-scrollbar">

                    {/* Scrollable Content */}


                    {/* Input Area */}
                    <div className="flex flex-col items-center gap-2 mb-4">
                        <div className="relative w-full flex justify-center">
                            <Input
                                radius={24}
                                value={localState.ticker}
                                onChange={(e) => updateState({
                                    ticker: e.target.value.replace(/[^a-zA-Z0-9]/g, "").slice(0, 15),
                                    isTickerManuallyEdited: true
                                })}
                                className="!text-center !text-5xl font-bold tracking-tight placeholder:text-5xl placeholder:text-zinc-700 w-full h-24 p-0"
                                placeholder="$•••••"
                                autoFocus
                            />
                        </div>
                    </div>
                    <p className="text-[13px] text-zinc-500 text-center">
                        Tickers are short nicknames that others will see when trading your content.
                    </p>

                    {/* Token Name */}
                    <div className="space-y-2">
                        <Label className="text-[15px] font-semibold text-zinc-300">Token name</Label>
                        <Input
                            radius={16}
                            value={localState.name}
                            onChange={(e) => updateState({ name: e.target.value.slice(0, 32), isNameManuallyEdited: true })}
                            placeholder="e.g. Diamond Hands"
                            maxLength={32}
                            className="h-14 text-[15px]"
                        />
                        <p className="text-[11px] text-zinc-500">Leave blank to auto-name it from your post.</p>
                    </div>

                    {/* Socials (Optional) */}
                    <div className="space-y-3">
                        <Label className="text-[15px] font-semibold text-zinc-300">Socials (optional)</Label>
                        {([
                            { key: "twitterUrl" as const, Icon: XIcon, placeholder: "x.com/yourtoken" },
                            { key: "telegramUrl" as const, Icon: TelegramIcon, placeholder: "t.me/yourtoken" },
                            { key: "websiteUrl" as const, Icon: GlobeIcon, placeholder: "yourtoken.xyz" },
                        ]).map(({ key, Icon, placeholder }) => (
                            <div key={key} className="relative">
                                <Icon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 z-10 pointer-events-none" />
                                <Input
                                    radius={16}
                                    value={localState[key]}
                                    onChange={(e) => updateState({ [key]: e.target.value } as Partial<TokenLaunchState>)}
                                    placeholder={placeholder}
                                    className="pl-11 h-14 text-[15px]"
                                />
                            </div>
                        ))}
                    </div>

                    {/* Creator Fee Slider */}
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <Label className="text-[15px] font-semibold text-zinc-300">Creator fee</Label>
                            <span className="text-[13px] text-zinc-500">You earn {localState.creatorFee}% of every trade</span>
                        </div>
                        <div className="px-1">
                            <AnimatedSlider
                                label="Fee %"
                                value={localState.creatorFee}
                                onChange={(val) => updateState({ creatorFee: val })}
                                min={0}
                                max={5}
                                step={1}
                            />
                        </div>
                        <p className="text-[11px] text-zinc-500 text-center">
                            A fixed 1% platform fee is applied to all trading volume. Total Curve Fee: {localState.creatorFee + 1}%.
                        </p>
                    </div>

                    {/* First Buy */}
                    <div className="space-y-4">
                        <div className="space-y-1">
                            <Label className="text-[15px] font-semibold text-zinc-300">First buy amount (optional)</Label>
                            <p className="text-[13px] text-zinc-500">
                                Buy tokens immediately upon launch.
                            </p>
                        </div>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 text-base z-10 pointer-events-none">SOL</span>
                            <Input
                                radius={16}
                                type="number"
                                value={localState.buyAmount === undefined ? "" : localState.buyAmount}
                                onChange={(e) => updateState({ buyAmount: e.target.value ? parseFloat(e.target.value) : undefined })}
                                className="pl-13 h-12 text-[15px] [&::-webkit-inner-spin-button]:appearance-none"
                                placeholder="0.00"
                                step="0.01"
                                min="0"
                            />
                        </div>
                    </div>

                    {/* Split Earnings - Refactored UI */}
                    <Squircle asChild radius={24} autoEffects={false}>
                    <div className="space-y-5 p-6 bg-panel mb-6">
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label className="text-[15px] font-semibold text-white">Share fees (optional)</Label>
                                <p className="text-[13px] text-zinc-500">Share fees with up to 5 accounts.</p>
                            </div>
                            <Switch checked={splits.length > 0} onCheckedChange={(checked) => {
                                if (checked && splits.length === 0) setSplits([{ address: "", percentage: 10, platform: "site" }])
                                if (!checked) setSplits([])
                            }} />
                        </div>

                        {/* Your Share Display */}
                        <div className="flex items-center justify-between px-1">
                            <span className="text-[13px] font-semibold text-zinc-400">Your share</span>
                            <span className="text-[15px] font-bold tabular-nums text-white">
                                {creatorShare.toFixed(2)}%
                            </span>
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
                                            <button onClick={() => removeSplit(index)} className="group rounded-full p-2 transition-colors hover:bg-pastelred/10">
                                                <HugeiconsIcon icon={Delete02Icon} className="size-4 text-zinc-600 transition-colors group-hover:text-pastelred" strokeWidth={2} />
                                            </button>
                                        </div>

                                        {/* Platform Icons Row */}
                                        <div className="flex gap-2">
                                            {([
                                                { icon: XIcon, id: "twitter" },
                                                { icon: KickIcon, id: "kick" },
                                                { icon: TwitchIcon, id: "twitch" },
                                                { icon: SolanaIcon, id: "solana" },
                                                { icon: AtIcon, id: "site" }
                                            ] as const).map((platformItem, i) => {
                                                const Icon = platformItem.icon;
                                                const isActive = split.platform === platformItem.id;
                                                return (
                                                    <div
                                                        key={i}
                                                        onClick={() => updateSplit(index, { platform: platformItem.id })}
                                                        className={cn(
                                                            "flex size-10 cursor-pointer items-center justify-center rounded-full transition-all active:scale-95",
                                                            isActive ? "bg-white text-black" : "bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white"
                                                        )}
                                                    >
                                                        <Icon className="w-5 h-5" />
                                                    </div>
                                                )
                                            })}
                                        </div>

                                        <Input
                                            radius={14}
                                            value={split.address}
                                            onChange={(e) => updateSplit(index, { address: e.target.value })}
                                            placeholder={split.platform === 'solana' ? "Wallet address" : "@username"}
                                            className="h-12 text-[13px]"
                                        />

                                        <div className="flex items-center justify-between pt-1">
                                            <span className="text-[12px] font-medium text-zinc-500">Fee percentage</span>
                                            <span className="text-[13px] font-semibold tabular-nums text-white">{split.percentage.toFixed(2)}%</span>
                                        </div>

                                        {/* Percentage Presets */}
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
                                                    onChange={(e) => updateSplit(index, { percentage: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)) })}
                                                    placeholder="Custom"
                                                    className="h-8 w-full px-2 text-center text-[12px] font-medium"
                                                />
                                            </div>
                                        </div>

                                        <Button className="mt-2 h-11 w-full rounded-full bg-white/10 font-bold text-white hover:bg-white/20">
                                            Save
                                        </Button>
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


                        {splits.length > 0 && splits.length < 5 && (
                            <Button
                                variant="ghost"
                                className="h-12 w-full rounded-full bg-white/5 text-[13px] font-semibold text-zinc-400 hover:bg-white/10 hover:text-white"
                                onClick={addSplit}
                            >
                                <HugeiconsIcon icon={PlusSignIcon} className="mr-1 size-4" strokeWidth={2} />
                                Add fee earner (max 5)
                            </Button>
                        )}

                    </div>
                    </Squircle>
                </div>

                {/* Footer Save Button - Fixed at bottom */}
                <div className="absolute bottom-0 left-0 right-0 z-10 bg-black/80 p-6 backdrop-blur-md">
                    <Button
                        onClick={handleSave}
                        size="lg"
                        className="w-full rounded-full bg-white text-black hover:bg-zinc-200 font-bold text-base h-12"
                    >
                        Save Ticker
                    </Button>
                </div>
            </DialogContent >
        </Dialog >
    )
}
