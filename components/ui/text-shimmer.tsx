"use client"

import React, { useMemo } from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

export type TextShimmerProps = {
    children: string
    as?: React.ElementType
    className?: string
    duration?: number
    spread?: number
}

export function TextShimmer({
    children,
    as: Component = "p",
    className,
    duration = 2,
    spread = 2,
}: TextShimmerProps) {
    const MotionComponent = useMemo(() => motion.create(Component as React.ElementType), [Component])

    const dynamicSpread = useMemo(() => {
        return children.length * spread
    }, [children, spread])

    return (
        <MotionComponent
            className={cn(
                "relative inline-block bg-[length:250%_100%,auto] bg-clip-text",
                "text-transparent [--base-color:#a1a1aa] [--base-gradient-color:#ffffff]",
                "dark:[--base-color:#71717a] dark:[--base-gradient-color:#ffffff]",
                "[background-image:linear-gradient(90deg,#0000_calc(50%-var(--shimmer-width)/2),var(--base-gradient-color)_50%,#0000_calc(50%+var(--shimmer-width)/2)),linear-gradient(var(--base-color),var(--base-color))]",
                className
            )}
            initial={{ backgroundPosition: "100% center" }}
            animate={{ backgroundPosition: "0% center" }}
            transition={{
                repeat: Infinity,
                duration,
                ease: "linear",
            }}
            style={
                {
                    "--shimmer-width": `${dynamicSpread}em`,
                } as React.CSSProperties
            }
        >
            {children}
        </MotionComponent>
    )
}
