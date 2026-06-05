"use client"

import * as React from "react"
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
// Use the exact spring config from Bloom for consistency
import { reducedMotionSpring } from "./bloom/utils/animations"

const BloomDropdownContext = React.createContext<{
    open: boolean
    setOpen: (open: boolean) => void
}>({
    open: false,
    setOpen: () => { },
})

const BloomDropdownMenu = ({
    children,
    open: controlledOpen,
    onOpenChange: controlledOnOpenChange,
    ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) => {
    const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false)
    const isControlled = controlledOpen !== undefined
    const open = isControlled ? controlledOpen : uncontrolledOpen
    const setOpen = isControlled ? controlledOnOpenChange! : setUncontrolledOpen

    return (
        <BloomDropdownContext.Provider value={{ open: !!open, setOpen }}>
            <DropdownMenuPrimitive.Root
                open={open}
                onOpenChange={setOpen}
                {...props}
            >
                {children}
            </DropdownMenuPrimitive.Root>
        </BloomDropdownContext.Provider>
    )
}

const BloomDropdownTrigger = DropdownMenuPrimitive.Trigger
const BloomDropdownPortal = DropdownMenuPrimitive.Portal

const BloomDropdownContent = React.forwardRef<
    React.ElementRef<typeof DropdownMenuPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 4, children, ...props }, ref) => {
    const { open } = React.useContext(BloomDropdownContext)

    return (
        <DropdownMenuPrimitive.Portal forceMount>
            <AnimatePresence>
                {open && (
                    <DropdownMenuPrimitive.Content
                        ref={ref}
                        align="end"
                        sideOffset={sideOffset}
                        asChild
                        forceMount
                        className="z-50"
                        {...props}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, filter: "blur(4px)" }}
                            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                            exit={{ opacity: 0, scale: 0.95, filter: "blur(2px)" }}
                            transition={{
                                type: "spring",
                                bounce: 0,
                                duration: 0.25
                            }}
                            className={cn(
                                "z-50 min-w-[12rem] overflow-hidden rounded-2xl border border-white/5 bg-black1 p-1 text-zinc-200 shadow-xl",
                                className
                            )}
                        >
                            {children}
                        </motion.div>
                    </DropdownMenuPrimitive.Content>
                )}
            </AnimatePresence>
        </DropdownMenuPrimitive.Portal>
    )
})
BloomDropdownContent.displayName = DropdownMenuPrimitive.Content.displayName

const BloomDropdownItem = React.forwardRef<
    React.ElementRef<typeof DropdownMenuPrimitive.Item>,
    React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
        inset?: boolean
    }
>(({ className, inset, ...props }, ref) => (
    <DropdownMenuPrimitive.Item
        ref={ref}
        className={cn(
            "relative flex cursor-pointer select-none items-center rounded-xl px-2 py-2 text-sm outline-none transition-colors hover:bg-white/5 hover:text-white focus:bg-white/5 focus:text-white data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
            inset && "pl-8",
            className
        )}
        {...props}
    />
))
BloomDropdownItem.displayName = DropdownMenuPrimitive.Item.displayName

const BloomDropdownSeparator = React.forwardRef<
    React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
    React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
    <DropdownMenuPrimitive.Separator
        ref={ref}
        className={cn("-mx-1 my-1 h-px bg-zinc-800", className)}
        {...props}
    />
))
BloomDropdownSeparator.displayName = DropdownMenuPrimitive.Separator.displayName

export {
    BloomDropdownMenu as Root,
    BloomDropdownTrigger as Trigger,
    BloomDropdownContent as Content,
    BloomDropdownItem as Item,
    BloomDropdownSeparator as Separator,
    BloomDropdownPortal as Portal,
}
