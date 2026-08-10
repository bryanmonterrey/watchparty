"use client"

import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"

import { cn } from "@/lib/utils"
import { POPOVER_MOTION_CLASS } from "@/lib/surfaces";

const Popover = PopoverPrimitive.Root

const PopoverTrigger = PopoverPrimitive.Trigger

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = "center", sideOffset = 4, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <>
      <PopoverPrimitive.Close asChild>
        <div
          className="fixed inset-0 z-40 cursor-default"
          onClick={(e) => e.stopPropagation()}
          aria-hidden
        />
      </PopoverPrimitive.Close>
      <PopoverPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        className={cn(
          POPOVER_MOTION_CLASS,
          "z-50 w-72 rounded-md border border-zinc-800 bg-zinc-900 p-4 text-zinc-300 shadow-md outline-none",
          className
        )}
        {...props}
      />
    </>
  </PopoverPrimitive.Portal>
))
PopoverContent.displayName = PopoverPrimitive.Content.displayName

export { Popover, PopoverTrigger, PopoverContent }
