"use client"

// Vendored from prompt-kit (prompt-kit.com/c/scroll-button.json) rather than
// installed via the shadcn CLI: the registry item lists `button` as a registry
// dependency, and letting the CLI resolve that would have reinstalled our
// customized components/ui/button.tsx over the top of the h-11 size scale.
// Only change from source: lucide swapped for HugeIcons, per the house rule.

import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { type VariantProps } from "class-variance-authority"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowDown01Icon } from "@hugeicons/core-free-icons"
import { useStickToBottomContext } from "use-stick-to-bottom"

export type ScrollButtonProps = {
  className?: string
  variant?: VariantProps<typeof buttonVariants>["variant"]
  size?: VariantProps<typeof buttonVariants>["size"]
} & React.ButtonHTMLAttributes<HTMLButtonElement>

function ScrollButton({
  className,
  variant = "outline",
  size = "sm",
  ...props
}: ScrollButtonProps) {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext()

  return (
    <Button
      variant={variant}
      size={size}
      className={cn(
        "h-10 w-10 rounded-full transition-all duration-150 ease-out",
        !isAtBottom
          ? "translate-y-0 scale-100 opacity-100"
          : "pointer-events-none translate-y-4 scale-95 opacity-0",
        className
      )}
      onClick={() => scrollToBottom()}
      {...props}
    >
      <HugeiconsIcon icon={ArrowDown01Icon} className="h-5 w-5" strokeWidth={2} />
    </Button>
  )
}

export { ScrollButton }
