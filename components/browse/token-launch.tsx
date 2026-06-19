
import * as React from "react"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { AnimatedSlider } from "@/components/ui/motion-slider"
import { BagIcon, SolanaIcon } from "@/components/icons"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"

export interface SplitShare {
    address: string;
    percentage: number;
    platform: "twitter" | "kick" | "twitch" | "solana" | "site";
}

export interface TokenLaunchState {
    earningsEnabled: boolean
    ticker: string
    creatorFee: number
    splits: SplitShare[]
    buyAmount: number | undefined
    isTickerManuallyEdited: boolean
}

interface TokenLaunchSectionProps {
    state: TokenLaunchState
    setState: React.Dispatch<React.SetStateAction<TokenLaunchState>>
    onOpenDialog: () => void
}

export function TokenLaunchSection({ state, setState, onOpenDialog }: TokenLaunchSectionProps) {
    const updateState = (updates: Partial<TokenLaunchState>) => {
        setState(prev => ({ ...prev, ...updates }))
    }

    return (
        <div className="space-y-4 border border-zinc-800 bg-zinc-900/30 rounded-xl p-5">
            <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                    <Label className="text-base font-medium text-zinc-200">Token Launch</Label>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-lantern/10 text-lantern border border-lantern/20">New</span>
                </div>
                <p className="text-xs text-zinc-500">Launch a token for this content to earn from trading volume.</p>
            </div>

            <div className="pt-2">
                <div className="flex items-center justify-between bg-zinc-900/50 rounded-full p-1.5 border border-zinc-800/50 pr-4">
                    <TokenLaunchTrigger state={state} onClick={onOpenDialog} />

                    <span className="text-xs text-zinc-500 font-medium ml-auto">
                        Creator Fee: <span className="text-zinc-300">{state.creatorFee}%</span>
                    </span>
                    <span className="mx-2 text-zinc-700">•</span>
                    <span className={cn("text-xs font-medium", state.buyAmount && state.buyAmount > 0 ? "text-lantern" : "text-zinc-400")}>
                        {state.buyAmount && state.buyAmount > 0 ? "Live Launch" : "Scheduled"}
                    </span>
                </div>
            </div>
        </div>
    )
}

interface TokenLaunchTriggerProps {
    state: TokenLaunchState
    onClick: () => void
    className?: string
}

export function TokenLaunchTrigger({ state, onClick, className }: TokenLaunchTriggerProps) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "flex items-center ease-in-out cursor-pointer gap-2 px-5 py-1.5 rounded-full bg-zinc-900/90 hover:bg-zinc-900 transition-all group",
                className
            )}
        >

            <span className="text-zinc-400 text-base font-extrabold tracking-tighter px-2 uppercase">
                ${state.ticker || " • • • • • • •"}
            </span>
        </button>
    )
}
