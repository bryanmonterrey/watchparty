import * as React from "react"

import { Squircle } from "@/components/ui/squircle"
import { cn } from "@/lib/utils"

// Squircle-clipped input (Lisse). The shape comes entirely from the clip-path,
// so the element stays `rounded-none` and must not carry a border or focus
// ring — both are painted on the rectangular box and get cut at the clipped
// corners. State reads through background tints instead.
function Input({
  className,
  type,
  radius = 14,
  ref,
  ...props
}: React.ComponentProps<"input"> & { radius?: number }) {
  return (
    <Squircle asChild radius={radius}>
      <input
        ref={ref}
        type={type}
        data-slot="input"
        className={cn(
          "h-11 w-full min-w-0 rounded-none bg-white/[0.06] px-4 text-[14px] font-medium text-white outline-none transition-colors",
          "placeholder:text-zinc-600 selection:bg-white/20 selection:text-white",
          "focus:bg-white/[0.1]",
          "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-white",
          "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
          "aria-invalid:bg-pastelred/10 aria-invalid:placeholder:text-pastelred/60",
          className
        )}
        {...props}
      />
    </Squircle>
  )
}

export { Input }
