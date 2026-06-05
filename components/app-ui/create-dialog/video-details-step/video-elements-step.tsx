"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import type { DraftCard } from "@/components/video/cards"
import type { EndScreenElement } from "@/components/video/end-screen"

interface VideoElementsStepProps {
    pendingCards: DraftCard[]
    onCardsEditorOpen: () => void
    pendingEndScreenElements: EndScreenElement[]
    onEndScreenEditorOpen: () => void
    videoUrl: string | null
}

export function VideoElementsStep({ pendingCards, onCardsEditorOpen, pendingEndScreenElements, onEndScreenEditorOpen, videoUrl }: VideoElementsStepProps) {
    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="space-y-1 mb-8">
                <h3 className="text-xl font-semibold text-white">Video elements</h3>
                <p className="text-sm text-zinc-400">Use cards and an end screen to show viewers related videos, websites, and calls to action. <a href="#" className="text-blue-500 hover:underline">Learn more</a></p>
            </div>

            {/* End Screen */}
            <div className="flex items-center justify-between p-6 bg-zinc-900/50 rounded-3xl group hover:bg-zinc-900 transition-colors">
                <div className="flex items-start gap-4">
                    <div className="p-3 bg-zinc-800 rounded-full text-zinc-400">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></svg>
                    </div>
                    <div className="space-y-1">
                        <h4 className="font-semibold text-white">Add an end screen</h4>
                        <p className="text-sm text-zinc-500">
                            Promote related content at the end of your video
                            {pendingEndScreenElements.length > 0 && (
                                <span className="ml-2 text-twitter2 font-medium">{pendingEndScreenElements.length} element{pendingEndScreenElements.length !== 1 ? "s" : ""} added</span>
                            )}
                        </p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button disabled className="bg-zinc-800 hover:bg-zinc-700 text-white text-md font-semibold px-6 py-3 rounded-full">Import from video</Button>
                    <Button
                        className="bg-zinc-800 hover:bg-zinc-700 text-white text-md font-semibold px-6 py-3 rounded-full"
                        onClick={onEndScreenEditorOpen}
                    >
                        {pendingEndScreenElements.length > 0 ? "Edit" : "Add"}
                    </Button>
                </div>
            </div>

            {/* Cards */}
            <div className="flex items-center justify-between p-6 bg-zinc-900/50 rounded-3xl group hover:bg-zinc-900 transition-colors">
                <div className="flex items-start gap-4">
                    <div className="p-3 bg-zinc-800 rounded-full text-zinc-400">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="16" y2="12" /><line x1="12" x2="12.01" y1="8" y2="8" /></svg>
                    </div>
                    <div className="space-y-1">
                        <h4 className="font-semibold text-white">Add cards</h4>
                        <p className="text-sm text-zinc-500">
                            Promote related content during your video
                            {pendingCards.length > 0 && (
                                <span className="ml-2 text-twitter2 font-medium">{pendingCards.length} card{pendingCards.length !== 1 ? "s" : ""} added</span>
                            )}
                        </p>
                    </div>
                </div>
                <Button

                    className="bg-zinc-800 hover:bg-zinc-700 text-white text-md font-semibold px-6 py-3 rounded-full"
                    onClick={onCardsEditorOpen}
                >
                    {pendingCards.length > 0 ? "Edit" : "Add"}
                </Button>
            </div>
        </div>
    )
}
