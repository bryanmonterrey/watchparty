"use client"

import * as React from "react"
import { ScrollArea } from "@base-ui/react/scroll-area"
import { cn } from "@/lib/utils"
import "./scroll-area.css"

function AppScrollArea({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ScrollArea.Root>) {
  return (
    <ScrollArea.Root
      data-slot="scroll-area"
      className={cn("relative overflow-hidden", className)}
      {...props}
    >
      <ScrollArea.Viewport
        data-slot="scroll-area-viewport"
        className="size-full rounded-[inherit]"
      >
        {children}
      </ScrollArea.Viewport>
      <ScrollArea.Scrollbar
        data-slot="scroll-area-scrollbar"
        orientation="vertical"
        className="scroll-area-scrollbar"
      >
        <ScrollArea.Thumb className="scroll-area-thumb" />
      </ScrollArea.Scrollbar>
      <ScrollArea.Scrollbar
        data-slot="scroll-area-scrollbar"
        orientation="horizontal"
        className="scroll-area-scrollbar scroll-area-scrollbar-horizontal"
      >
        <ScrollArea.Thumb className="scroll-area-thumb" />
      </ScrollArea.Scrollbar>
      <ScrollArea.Corner />
    </ScrollArea.Root>
  )
}

export { AppScrollArea as ScrollArea }
