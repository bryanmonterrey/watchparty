"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      // Sonner's runtime-injected stylesheet applies its own --border-radius
      // (13px default) AFTER our classes, so `rounded-3xl` never actually won
      // the cascade — set the variable sonner itself reads. 24px = the
      // rounded-3xl the toast always claimed; globals.css backstops it.
      style={{ "--border-radius": "24px" } as React.CSSProperties}
      toastOptions={{
        classNames: {
          // No gray drop shadow (house rule) — the hairline border carries
          // the elevation; motion is the global transitions.dev override in
          // globals.css.
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-none rounded-3xl",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground font-medium",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground font-medium",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
