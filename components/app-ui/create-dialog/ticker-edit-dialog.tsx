"use client"

import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Delete02Icon, PlusSignIcon } from "@hugeicons/core-free-icons"
import { XIcon, KickIcon, TwitchIcon, SolanaIcon, AtIcon, TelegramIcon, GlobeIcon } from "@/components/icons"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ShareFees } from "@/components/tokens/share-fees"
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
                        <Label className="text-[15px] font-semibold text-zinc-300">Coin name</Label>
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
                                className="pl-13 h-14 text-[15px] [&::-webkit-inner-spin-button]:appearance-none"
                                placeholder="0.00"
                                step="0.01"
                                min="0"
                            />
                        </div>
                    </div>

                    {/* Fee sharing — the SAME component the coin composer
                        uses (components/tokens/share-fees). It lived here as
                        an inline copy in BOTH ticker dialogs, so the identical
                        money-routing UI existed three times and could drift
                        three ways. Behaviour is unchanged: splits still go
                        wherever the creator points them. */}
                    <ShareFees splits={splits} onChange={setSplits} />
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
