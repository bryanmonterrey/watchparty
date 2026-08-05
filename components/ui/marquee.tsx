import { ComponentPropsWithoutRef } from "react"

import { cn } from "@/lib/utils"

interface MarqueeProps extends ComponentPropsWithoutRef<"div"> {
    /**
     * Optional CSS class name to apply custom styles
     */
    className?: string
    /**
     * Whether to reverse the animation direction
     * @default false
     */
    reverse?: boolean
    /**
     * Whether to pause the animation on hover
     * @default false
     */
    pauseOnHover?: boolean
    /**
     * Content to be displayed in the marquee
     */
    children: React.ReactNode
    /**
     * Whether to animate vertically instead of horizontally
     * @default false
     */
    vertical?: boolean
    /**
     * Number of times to repeat the content
     * @default 4
     */
    repeat?: number
    /**
     * Scroll twice, then hold, then repeat — instead of moving forever.
     *
     * For a strip carrying a MESSAGE rather than a list. Continuous motion turns
     * a call to action into wallpaper; two passes and a rest reads as something
     * that was said. Needs repeat >= 4, since the cycle travels two copy-widths.
     */
    burst?: boolean
}

export function Marquee({
    className,
    reverse = false,
    pauseOnHover = false,
    children,
    vertical = false,
    repeat = 4,
    burst = false,
    ...props
}: MarqueeProps) {
    return (
        <div
            {...props}
            className={cn(
                "group flex [gap:var(--gap)] overflow-hidden p-2 pt-1 [--duration:40s] [--gap:1rem]",
                {
                    "flex-row": !vertical,
                    "flex-col": vertical,
                },
                className
            )}
        >
            {Array(repeat)
                .fill(0)
                .map((_, i) => (
                    <div
                        key={i}
                        className={cn("flex shrink-0 justify-start [gap:var(--gap)] min-w-full will-change-transform motion-reduce:animate-none", {
                            "animate-marquee flex-row": !vertical && !burst,
                            "animate-marquee-burst flex-row": !vertical && burst,
                            "animate-marquee-vertical flex-col": vertical,
                            "group-hover:[animation-play-state:paused]": pauseOnHover,
                            "[animation-direction:reverse]": reverse,
                        })}
                    >
                        {children}
                    </div>
                ))}
        </div>
    )
}
