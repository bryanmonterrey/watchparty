"use client"

import * as React from "react"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { HugeiconsIcon } from "@hugeicons/react"
import { CheckIcon } from "@hugeicons/core-free-icons"

import { cn } from "@/lib/utils"

// The app's one checkbox: circular, neutral soft-gray fill, white HugeIcons
// check that stroke-draws in via the transitions.dev "checkbox check" (the
// .t-check block in globals.css — box fills, then the mark draws; unchecking
// reverses fast with no draw). The CSS keys on aria-checked, which the radix
// root sets by itself; the indicator is forceMount because the path has to be
// in the DOM before the check flips or the dashoffset transition has no start
// state — an unmounted-on-uncheck indicator hard-cuts instead of drawing.
function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer t-check border-input bg-soft-gray/5 data-[state=checked]:bg-soft-gray/15 focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive size-4 shrink-0 rounded-full border outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        forceMount
        className="grid place-content-center text-white"
      >
        <HugeiconsIcon icon={CheckIcon} className="size-3.5" strokeWidth={2.5} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
