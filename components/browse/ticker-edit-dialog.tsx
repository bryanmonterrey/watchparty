"use client"

import * as React from "react"
import { ChevronLeft, Sparkles, Plus, Trash2, X } from "lucide-react"
import { XIcon, KickIcon, TwitchIcon, SolanaIcon, AtIcon } from "@/components/icons"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { AnimatedSlider } from "@/components/ui/motion-slider"
import * as VisuallyHidden from "@radix-ui/react-visually-hidden"
import { TokenLaunchState, SplitShare } from "@/components/browse/token-launch"
import { AnimatePresence, motion } from "framer-motion"
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
        onSave({ ...localState, splits, earningsEnabled: !!localState.ticker })
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
            <DialogContent className="sm:max-w-[500px] bg-black border-zinc-800 p-0 gap-0 top-[50%] overflow-hidden flex flex-col max-h-[85vh] rounded-[32px]">
                <VisuallyHidden.Root>
                    <DialogTitle>Edit Ticker</DialogTitle>
                </VisuallyHidden.Root>

                {/* Header */}
                <div className="flex items-center justify-between p-6 pb-0 shrink-0">
                    <button
                        onClick={handleClose}
                        className="p-1 hover:bg-zinc-800 rounded-full transition-colors"
                    >
                        <ChevronLeft className="w-5 h-5 text-zinc-400" />
                    </button>
                    <div className="flex flex-col items-center">
                        <h2 className="text-lg font-semibold text-white">Edit Ticker</h2>
                        {state.ticker !== localState.ticker && (
                            <span className="text-[10px] text-lantern font-medium">Unsaved Changes</span>
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
                                value={localState.ticker}
                                onChange={(e) => updateState({
                                    ticker: e.target.value.replace(/[^a-zA-Z0-9]/g, "").slice(0, 15),
                                    isTickerManuallyEdited: true
                                })}
                                className="bg-zinc-850 border-0 rounded-2xl focus-visible:ring-0 !text-center !text-5xl font-bold tracking-wider text-white placeholder:text-5xl placeholder:text-zinc-700 w-full h-24 p-0 selection:bg-lantern/30"
                                placeholder="$ticker"
                                autoFocus
                            />
                        </div>
                    </div>
                    <p className="text-zinc-500 text-sm text-center">
                        Tickers are short nicknames that others will see when trading your content.
                    </p>

                    {/* Creator Fee Slider */}
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <Label className="text-base font-medium text-zinc-300">Creator Fee</Label>
                            <span className="text-sm text-zinc-500">You earn {localState.creatorFee}% of every trade</span>
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
                            <Label className="text-base font-medium text-zinc-300">First Buy Amount (Optional)</Label>
                            <p className="text-sm text-zinc-500">
                                Buy tokens immediately upon launch.
                            </p>
                        </div>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 text-base">SOL</span>
                            <Input
                                type="number"
                                value={localState.buyAmount === undefined ? "" : localState.buyAmount}
                                onChange={(e) => updateState({ buyAmount: e.target.value ? parseFloat(e.target.value) : undefined })}
                                className="pl-13 bg-zinc-900/50 border-zinc-800/50 focus:border-lantern/50 h-12 rounded-[24px] text-base [&::-webkit-inner-spin-button]:appearance-none"
                                placeholder="0.00"
                                step="0.01"
                                min="0"
                            />
                        </div>
                    </div>

                    {/* Split Earnings - Refactored UI */}
                    <div className="space-y-5 p-6 bg-zinc-900/20 rounded-[32px] border border-zinc-800/50 mb-6">
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label className="text-base font-medium text-white">Share fees (Optional)</Label>
                                <p className="text-sm text-zinc-500">Share fees with up to 5 accounts.</p>
                            </div>
                            <Switch checked={splits.length > 0} onCheckedChange={(checked) => {
                                if (checked && splits.length === 0) setSplits([{ address: "", percentage: 10, platform: "site" }])
                                if (!checked) setSplits([])
                            }} />
                        </div>

                        {/* Your Share Display */}
                        <div className="bg-zinc-950 rounded-[20px] p-4 flex justify-between items-center border border-zinc-800">
                            <span className="font-semibold text-sm text-white">Your share</span>
                            <span className="font-bold text-base text-white">
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
                                    <div className="bg-zinc-950 rounded-[24px] border border-zinc-800 p-5 space-y-4 relative">
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-medium text-white">Fee Earner #{index + 1}</span>
                                            <div className="flex gap-2">
                                                <button onClick={() => removeSplit(index)} className="p-2 hover:bg-red-500/10 rounded-full group transition-colors">
                                                    <Trash2 className="w-4 h-4 text-zinc-600 group-hover:text-red-500" />
                                                </button>
                                                <button className="p-2 hover:bg-zinc-800 rounded-full transition-colors">
                                                    <ChevronLeft className="w-4 h-4 text-zinc-600 rotate-90" />
                                                </button>
                                            </div>
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
                                                            "w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer transition-all",
                                                            isActive ? "bg-lantern text-black" : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:bg-zinc-800"
                                                        )}
                                                    >
                                                        <Icon className="w-5 h-5" />
                                                    </div>
                                                )
                                            })}
                                        </div>

                                        <div className="relative">
                                            <Input
                                                value={split.address}
                                                onChange={(e) => updateSplit(index, { address: e.target.value })}
                                                placeholder={split.platform === 'solana' ? "Wallet Address" : "@username"}
                                                className="bg-black border-zinc-800 rounded-[18px] h-12 pl-4 text-sm focus:border-lantern/50 transition-colors"
                                            />
                                        </div>

                                        <div className="flex items-center justify-between pt-1">
                                            <span className="text-xs text-zinc-500 font-medium">Fee percentage</span>
                                            <span className="text-sm text-white font-medium">{split.percentage.toFixed(2)}%</span>
                                        </div>

                                        {/* Percentage Presets */}
                                        <div className="flex gap-2">
                                            {[1, 10, 50, 100].map((p) => (
                                                <button
                                                    key={p}
                                                    onClick={() => updateSplit(index, { percentage: p })}
                                                    className="flex-1 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900/50 text-xs font-medium text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors"
                                                >
                                                    {p}%
                                                </button>
                                            ))}
                                            <div className="flex-1 flex items-center relative">
                                                <Input
                                                    type="number"
                                                    value={split.percentage === 0 ? "" : split.percentage}
                                                    onChange={(e) => updateSplit(index, { percentage: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)) })}
                                                    placeholder="Custom"
                                                    className="w-full py-1.5 h-auto min-h-0 rounded-lg border border-zinc-800 bg-zinc-900/50 text-xs font-medium text-zinc-400 hover:bg-zinc-800 transition-colors px-2 text-center text-ellipsis"
                                                />
                                            </div>
                                        </div>

                                        <Button className="w-full bg-lantern hover:bg-lantern/90 text-black font-bold h-11 rounded-xl mt-2">
                                            Save
                                        </Button>
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>

                        <div className="pt-2">
                            <div className="flex items-center justify-between mb-2">
                                <div className="space-y-0.5">
                                    <Label className="text-sm font-medium text-white">Split fees equally</Label>
                                    <p className="text-xs text-zinc-500">split fees equally between all fee earners</p>
                                </div>
                                <Switch onClick={splitEqually} />
                            </div>
                        </div>


                        {splits.length > 0 && splits.length < 5 && (
                            <Button
                                variant="outline"
                                className="w-full border-dashed border-zinc-800 hover:bg-zinc-900/50 hover:border-zinc-700 rounded-[20px] h-12 text-zinc-400 text-sm font-medium"
                                onClick={addSplit}
                            >
                                <Plus className="w-4 h-4 mr-2" />
                                add fee earner (max 5)
                            </Button>
                        )}

                    </div>
                </div>

                {/* Footer Save Button - Fixed at bottom */}
                <div className="p-6 border-t border-zinc-800 bg-black absolute bottom-0 left-0 right-0 z-10">
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
