"use client"

import * as React from "react"
import * as AvatarPrimitive from "@radix-ui/react-avatar"

import { cn } from "@/lib/utils"

function Avatar({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Root>) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn(
        "relative flex size-8 shrink-0 overflow-hidden rounded-full",
        className
      )}
      {...props}
    />
  )
}

function AvatarImage({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn("aspect-square size-full object-cover", className)}
      {...props}
    />
  )
}

// Never render a letter fallback — always the default avatar image
// (/public/avatar.png). Any children callers pass (initials) are intentionally
// ignored so no avatar ever falls back to a letter.
function AvatarFallback({
  className,
  children: _ignored,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      delayMs={0}
      className={cn("flex size-full items-center justify-center overflow-hidden rounded-full", className)}
      {...props}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/avatar.png" alt="" className="size-full object-cover" />
    </AvatarPrimitive.Fallback>
  )
}

export { Avatar, AvatarImage, AvatarFallback }
