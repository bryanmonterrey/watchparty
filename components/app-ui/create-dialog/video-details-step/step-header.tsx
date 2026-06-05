"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import type { StepType } from "./types"

const STEPS: { id: StepType; label: string }[] = [
    { id: "details", label: "Details" },
    { id: "video-elements", label: "Video elements" },
    { id: "checks", label: "Checks" },
    { id: "visibility", label: "Visibility" },
]

type StepState = "done" | "active" | "upcoming"

function getStepIndex(step: StepType) {
    return STEPS.findIndex(s => s.id === step)
}

function getStepState(stepId: StepType, currentStep: StepType): StepState {
    const currentIdx = getStepIndex(currentStep)
    const stepIdx = getStepIndex(stepId)
    if (stepIdx < currentIdx) return "done"
    if (stepIdx === currentIdx) return "active"
    return "upcoming"
}

function CheckIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M19.793 5.793 8.5 17.086l-4.293-4.293a1 1 0 10-1.414 1.414L8.5 19.914 21.207 7.207a1 1 0 10-1.414-1.414Z" />
        </svg>
    )
}

function StepBadge({ state }: { state: StepState }) {
    if (state === "done") {
        return (
            <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center text-black">
                <CheckIcon />
            </div>
        )
    }
    if (state === "active") {
        return (
            <div className="w-6 h-6 rounded-full border-5 border-white flex items-center justify-center">
                <div className="w-[8px] h-[8px] rounded-full bg-white" />
            </div>
        )
    }
    return <div className="w-3 h-3 rounded-full bg-zinc-600" />
}

interface StepHeaderProps {
    title: string
    currentStep: StepType
    onStepChange: (s: StepType) => void
}

export function StepHeader({ title, currentStep, onStepChange }: StepHeaderProps) {
    const currentIdx = getStepIndex(currentStep)

    return (
        <div className="flex flex-col gap-4 items-center px-12 py-4 flex-shrink-0">
            <h2 className="text-xl font-semibold text-white">{title || "Video Details"}</h2>

            {/* Stepper */}
            <div className="flex items-end w-full max-w-lg">
                {STEPS.map((step, i) => {
                    const state = getStepState(step.id, currentStep)
                    const isDone = state === "done"
                    const isActive = state === "active"
                    const isLast = i === STEPS.length - 1
                    const segmentDone = i < currentIdx

                    return (
                        <React.Fragment key={step.id}>
                            {/* Step column: label + badge */}
                            <button
                                onClick={() => isDone && onStepChange(step.id)}
                                disabled={!isDone}
                                className="flex flex-col items-center gap-1.5 flex-shrink-0 group"
                            >
                                <span className={cn(
                                    "text-sm whitespace-nowrap transition-colors",
                                    isActive ? "text-white font-semibold" :
                                    isDone   ? "text-white font-medium" :
                                               "text-zinc-500 font-medium"
                                )}>
                                    {step.label}
                                </span>
                                {/* Fixed 32×32 container keeps all badges at same height for line alignment */}
                                <div className="w-8 h-8 flex items-center justify-center">
                                    <StepBadge state={state} />
                                </div>
                            </button>

                            {/* Separator — mb-4 centres it on the 32px badge */}
                            {!isLast && (
                                <div
                                    className="flex-1 h-[3px] mb-4 mx-0.5 transition-colors duration-300"
                                    style={{ backgroundColor: segmentDone ? "#ffffff" : "#3f3f46" }}
                                />
                            )}
                        </React.Fragment>
                    )
                })}
            </div>
        </div>
    )
}
