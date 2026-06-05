import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[color,box-shadow] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          "bg-primary backdrop-blur-custom  text-primary-foreground shadow-xs hover:bg-primary/90 cursor-pointer rounded-full border border-zinc-600 transition-all ease-in-out duration-200",
        destructive:
          "bg-destructive backdrop-blur-custom  text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 cursor-pointer transition-all ease-in-out duration-200",
        outline:
          "bg-neutral-800/70 backdrop-blur-custom  hover:bg-neutral-800 shadow-xs cursor-pointer transition-ease-in-out ease-in-out duration-300",
        secondary:
          "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80 cursor-pointer transition-all ease-in-out duration-200",
        ghost: "hover:bg-accent hover:text-accent-foreground cursor-pointer transition-all ease-in-out duration-200",
        link: "text-primary underline-offset-4 hover:underline cursor-pointer transition-all ease-in-out duration-200",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3 cursor-pointer rounded-full transition-all ease-in-out duration-200",
        sm: "h-8 rounded-full gap-1.5 px-3 has-[>svg]:px-2.5 transition-all ease-in-out duration-200",
        lg: "h-10 rounded-full px-6 has-[>svg]:px-4 transition-all ease-in-out duration-200",
        icon: "size-9 rounded-full transition-all ease-in-out duration-200",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
