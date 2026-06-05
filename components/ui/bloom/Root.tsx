import {
    useRef,
    useState,
    useCallback,
    useMemo,
    type ReactNode,
} from 'react'
import { BloomContext } from './context'
import { useControllable } from './hooks/useControllable'
import { useClickOutside } from './hooks/useClickOutside'
import { useEscapeKey } from './hooks/useEscapeKey'
import type { BloomRootProps, DetailedAnimationConfig } from './types'
import { transitionConfig } from './utils/animations'

const defaultAnimationConfig: DetailedAnimationConfig = {
    morphStiffness: 382,
    morphDamping: 29,
    contentStiffness: 403,
    contentDamping: 36,
    contentDelay: 0.03,
    triggerBlur: 8,
    contentBlur: 10,
}

export function Root({
    children,
    open: controlledOpen,
    onOpenChange,
    defaultOpen = false,
    animationConfig,
    closeOnClickOutside = true,
    closeOnEscape = true,
    modal = false,
    direction = 'top',
    anchor: anchorProp = 'start',
    visualDuration = transitionConfig.visualDuration,
    bounce = transitionConfig.bounce,
}: BloomRootProps): ReactNode {
    // For horizontal directions (left/right), anchor is always center
    const anchor = (direction === 'left' || direction === 'right') ? 'center' : anchorProp
    const [open, setOpen] = useControllable({
        value: controlledOpen,
        defaultValue: defaultOpen,
        onChange: onOpenChange,
    })

    const triggerRef = useRef<HTMLElement | null>(null)
    const contentRef = useRef<HTMLDivElement | null>(null)

    // Track if open animation has completed (to prevent highlighting during animation)
    const isOpenAnimationCompleteRef = useRef(false)

    // Track active submenu (null = main menu visible)
    const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null)


    // Wrapper to reset animation state when menu opens/closes
    const handleSetOpen = useCallback(
        (newOpen: boolean) => {
            if (newOpen) {
                // Disable hover highlighting until open animation completes
                isOpenAnimationCompleteRef.current = false
            } else {
                // Reset submenu when menu closes
                setActiveSubmenu(null)
            }
            setOpen(newOpen)
        },
        [setOpen]
    )

    // Close on click outside
    useClickOutside(
        [triggerRef, contentRef],
        () => handleSetOpen(false),
        open && closeOnClickOutside
    )

    // Close on escape
    useEscapeKey(() => handleSetOpen(false), open && closeOnEscape)

    // Merge animation config with defaults
    const mergedAnimationConfig = useMemo(
        () => ({
            ...defaultAnimationConfig,
            ...animationConfig,
        }),
        [animationConfig]
    )

    const contextValue = useMemo(
        () => ({
            open,
            setOpen: handleSetOpen,
            triggerRef,
            contentRef,
            animationConfig: mergedAnimationConfig,
            closeOnClickOutside,
            closeOnEscape,
            modal,
            isOpenAnimationCompleteRef,
            direction,
            anchor,
            activeSubmenu,
            setActiveSubmenu,
            visualDuration,
            bounce,
        }),
        [
            open,
            handleSetOpen,
            mergedAnimationConfig,
            closeOnClickOutside,
            closeOnEscape,
            modal,
            direction,
            anchor,
            activeSubmenu,
            visualDuration,
            bounce,
        ]
    )

    return (
        <BloomContext.Provider value={contextValue}>
            {children}
        </BloomContext.Provider>
    )
}
