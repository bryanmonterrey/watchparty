"use client"

import * as React from "react"
import { ChevronDown } from "lucide-react"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"

interface VisibilityStepProps {
    visibility: string
    onVisibilityChange: (v: string) => void
}

export function VisibilityStep({ visibility, onVisibilityChange }: VisibilityStepProps) {
    return (
        <div className="space-y-8 max-w-2xl mx-auto">
            <div className="space-y-1">
                <h3 className="text-xl font-semibold text-white">Visibility</h3>
                <p className="text-sm text-zinc-400">Choose when to publish and who can see your video</p>
            </div>

            <div className="border border-zinc-800 rounded-3xl p-6 space-y-6">
                <RadioGroup value={visibility} onValueChange={onVisibilityChange} className="space-y-4">
                    <div className="space-y-4">
                        <h4 className="font-medium text-white">Save or publish</h4>
                        <p className="text-xs text-zinc-500">Make your video <b>public, unlisted,</b> or <b>private</b></p>

                        <div className="space-y-4 pt-2">
                            <div className="flex items-start space-x-3">
                                <RadioGroupItem value="private" id="private" className="mt-1 border-zinc-600 text-lantern" />
                                <div className="space-y-1">
                                    <Label htmlFor="private" className="text-sm font-medium text-zinc-300">Private</Label>
                                    <p className="text-xs text-zinc-500">Only you and people you choose can watch your video</p>
                                </div>
                            </div>

                            <div className="flex items-start space-x-3">
                                <RadioGroupItem value="unlisted" id="unlisted" className="mt-1 border-zinc-600 text-lantern" />
                                <div className="space-y-1">
                                    <Label htmlFor="unlisted" className="text-sm font-medium text-zinc-300">Unlisted</Label>
                                    <p className="text-xs text-zinc-500">Anyone with the video link can watch your video</p>
                                </div>
                            </div>

                            <div className="flex items-start space-x-3">
                                <RadioGroupItem value="public" id="public" className="mt-1 border-zinc-600 text-lantern" />
                                <div className="space-y-1">
                                    <Label htmlFor="public" className="text-sm font-medium text-zinc-300">Public</Label>
                                    <p className="text-xs text-zinc-500">Everyone can watch your video</p>
                                </div>
                            </div>
                        </div>

                        <div className="pl-7 pt-2">
                            <div className="flex items-center space-x-2">
                                <Checkbox id="premiere" disabled={visibility !== 'public'} />
                                <Label htmlFor="premiere" className="text-sm text-zinc-400 font-normal">Set as instant Premiere</Label>
                            </div>
                        </div>
                    </div>
                </RadioGroup>
            </div>

            <div className="border border-zinc-800 rounded-3xl p-4 flex items-center justify-between cursor-pointer hover:bg-zinc-900/50 transition-colors">
                <div className="space-y-1">
                    <h4 className="font-medium text-white">Schedule</h4>
                    <p className="text-xs text-zinc-500">Select a date to make your video <b>public</b>.</p>
                </div>
                <ChevronDown className="w-5 h-5 text-zinc-500" />
            </div>
        </div>
    )
}
