"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { TextShimmer } from "@/components/ui/text-shimmer"
import { TickerEditDialog } from "../ticker-edit-dialog"
import type { TokenLaunchState } from "../token-launch-section"
import type { StepType } from "./types"

interface StepFooterProps {
    currentStep: StepType
    isUploading: boolean
    uploadProgress: number
    tokenLaunch: TokenLaunchState
    onTokenLaunchSave: (updates: Partial<TokenLaunchState>) => void
    onBack: () => void
    onNext: () => void
}

export function StepFooter({
    currentStep,
    isUploading,
    uploadProgress,
    tokenLaunch,
    onTokenLaunchSave,
    onBack,
    onNext,
}: StepFooterProps) {
    const [isEditingTicker, setIsEditingTicker] = React.useState(false)

    return (
        <div className="flex items-center justify-between px-6 py-4 border-t rounded-b-4xl border-zinc-800 bg-black">
            <div className="flex items-center gap-2">
                {/* Only show Ticker on Details and Video Elements */}
                {(currentStep === "details" || currentStep === "video-elements") && (
                    <>
                        <button
                            onClick={() => setIsEditingTicker(true)}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-zinc-900/90 hover:bg-zinc-900 transition-all group"
                        >
                            <span className="text-zinc-400 text-sm font-bold tracking-tight">
                                ${tokenLaunch.ticker || "ticker"}
                            </span>
                        </button>

                        <TickerEditDialog
                            open={isEditingTicker}
                            onOpenChange={setIsEditingTicker}
                            state={tokenLaunch}
                            onSave={(updates) => {
                                onTokenLaunchSave(updates)
                            }}
                        />
                    </>
                )}

                {/* Show "Checks complete" on Checks and Visibility steps */}
                {(currentStep === "checks" || currentStep === "visibility") && (
                    <div className="flex items-center gap-2 text-zinc-400">
                        <div className="h-4 w-4 rounded-full border border-green-500 flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-green-500"><polyline points="20 6 9 17 4 12" /></svg>
                        </div>
                        <span className="text-sm">Checks complete. No issues found.</span>
                    </div>
                )}
            </div>
            <div className="flex items-center gap-3">
                {isUploading && (
                    <TextShimmer className="text-lg" duration={1.5} spread={2}>
                        {`Uploading ${uploadProgress}%`}
                    </TextShimmer>
                )}
                <Button variant="ghost" onClick={onBack} className="text-white text-lg  hover:bg-zinc-800">
                    Back
                </Button>

                <Button onClick={onNext} className={cn("text-black hover:bg-zinc-200 text-lg font-semibold px-6", currentStep === "visibility" ? "bg-white hover:bg-gray-200" : "bg-white")}>
                    {currentStep === "visibility" ? "Save" : "Next"}
                </Button>
            </div>
        </div>
    )
}
