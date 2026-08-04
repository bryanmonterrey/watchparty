"use client"

import * as React from "react"
import { RangeSlider } from "@/components/motion/range-slider"
import { cn } from "@/lib/utils"

// AnimatedSlider is now a thin adapter over beui's RangeSlider
// (components/motion/range-slider.tsx, added from @beui/range-slider) rather
// than its own framer-motion implementation.
//
// KEPT AS AN ADAPTER, not deleted, for two reasons:
//   - The old control drew a LABEL and a VALUE READOUT inside its track
//     ("Fee %" on the left, "3" on the right). RangeSlider is a bare 40px track
//     with ticks and a thumb — no text at all — so a straight swap would have
//     silently dropped the number people set the fee and leverage by. That row
//     moves above the track here.
//   - Seven call sites use this name and prop shape (browse + create-dialog
//     ticker dialogs, coin-composer, token-launch, perps). Holding the API
//     means the swap is one file, not seven diffs.
//
// The file name is now a misnomer — the motion lives in RangeSlider. Renaming
// it is a mechanical follow-up if wanted.

interface AnimatedSliderProps {
    label: string
    value?: number
    defaultValue?: number
    onChange?: (value: number) => void
    min?: number
    max?: number
    step?: number
    className?: string
}

export function AnimatedSlider({
    label,
    value,
    defaultValue = 50,
    onChange,
    min = 0,
    max = 100,
    step = 1,
    className,
}: AnimatedSliderProps) {
    // Uncontrolled call sites still need the readout to move, so mirror the
    // value locally and let a controlled `value` win when one is passed.
    const [internal, setInternal] = React.useState(defaultValue)
    const shown = value ?? internal

    return (
        <div className={cn("w-full select-none", className)}>
            {/* The label/value row the old track carried inside itself. Above
                the slider rather than over it — RangeSlider's thumb spans the
                full track height, so text behind it would be crossed out. */}
            <div className="mb-2 flex items-center justify-between">
                <span className="text-base font-medium text-neutral-300">{label}</span>
                <span className="text-xl font-semibold tabular-nums text-white">{shown}</span>
            </div>
            <RangeSlider
                value={value}
                defaultValue={defaultValue}
                onValueChange={(next) => {
                    setInternal(next)
                    onChange?.(next)
                }}
                min={min}
                max={max}
                step={step}
                aria-label={label}
            />
        </div>
    )
}
