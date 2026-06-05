import { useRef, useEffect, useState, useLayoutEffect, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useBloomContext, useSubMenuContext } from './context'
import { useReducedMotion } from './hooks/useReducedMotion'
import { reducedMotionSpring, CONTENT_BLUR } from './utils/animations'
import type { BloomSubMenuContentProps } from './types'

export function SubMenuContent({
    children,
    className = '',
    style,
}: BloomSubMenuContentProps): ReactNode {
    const { activeSubmenu, setActiveSubmenu, contentRef: mainContentRef, visualDuration, bounce } = useBloomContext()
    const { id, triggerRef } = useSubMenuContext()
    const prefersReducedMotion = useReducedMotion()
    const subMenuRef = useRef<HTMLDivElement>(null)
    const measureRef = useRef<HTMLDivElement>(null)

    // Trigger measurements
    const [triggerTop, setTriggerTop] = useState(0)
    const [triggerHeight, setTriggerHeight] = useState(44)

    // Content measurements (includes trigger height spacer + items)
    const [contentHeight, setContentHeight] = useState(triggerHeight)

    const isActive = activeSubmenu === id

    // Measure trigger dimensions when submenu opens
    useLayoutEffect(() => {
        if (isActive && triggerRef.current) {
            setTriggerTop(triggerRef.current.offsetTop)
            setTriggerHeight(triggerRef.current.offsetHeight)
        }
    }, [isActive, triggerRef])

    // Measure content height (spacer + items)
    useLayoutEffect(() => {
        if (isActive && measureRef.current) {
            setContentHeight(measureRef.current.offsetHeight)
        }
    }, [isActive, children, triggerHeight])

    // Handle click outside to close submenu (but not main menu)
    useEffect(() => {
        if (!isActive) return

        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node

            // If clicking inside the submenu content, do nothing
            if (subMenuRef.current?.contains(target)) {
                return
            }

            // If clicking on the trigger, let SubMenuTrigger handle it (toggle behavior)
            if (triggerRef.current?.contains(target)) {
                return
            }

            // If clicking inside the main menu container, just close the submenu
            if (mainContentRef.current?.contains(target)) {
                event.stopPropagation()
                setActiveSubmenu(null)
                return
            }

            // If clicking completely outside, close the submenu
            setActiveSubmenu(null)
        }

        // Delay adding listener to avoid immediate close from trigger click
        const timeoutId = setTimeout(() => {
            document.addEventListener('mousedown', handleClickOutside, true)
        }, 0)

        return () => {
            clearTimeout(timeoutId)
            document.removeEventListener('mousedown', handleClickOutside, true)
        }
    }, [isActive, setActiveSubmenu, mainContentRef])

    const springConfig = prefersReducedMotion
        ? { type: 'spring' as const, ...reducedMotionSpring }
        : { type: 'spring' as const, visualDuration, bounce }

    const contentSpringConfig = prefersReducedMotion
        ? { type: 'spring' as const, ...reducedMotionSpring }
        : { type: 'spring' as const, visualDuration: visualDuration * 0.85, bounce }

    // Content fade-in animation (like main menu content)
    const contentVariants = {
        hidden: {
            opacity: 0,
            filter: prefersReducedMotion ? 'blur(0px)' : `blur(${CONTENT_BLUR}px)`,
        },
        visible: {
            opacity: 1,
            filter: 'blur(0px)',
            transition: {
                ...contentSpringConfig,
                delay: 0.05,
            },
        },
        exit: {
            opacity: 0,
            filter: prefersReducedMotion ? 'blur(0px)' : `blur(${CONTENT_BLUR}px)`,
            transition: {
                duration: 0.15,
            },
        },
    }

    // Scale to pop forward to 1.06 visual (Container is at 0.96, so 0.96 * 1.104 ≈ 1.06)
    const openScale = 1.06 / 0.96 // ≈ 1.104

    return (
        <AnimatePresence>
            {isActive && (
                <motion.div
                    ref={subMenuRef}
                    className={className}
                    initial={{
                        height: triggerHeight,
                        scale: 1,
                        opacity: 1,
                        pointerEvents: 'auto' as const,
                    }}
                    animate={{
                        height: contentHeight,
                        scale: openScale,
                        opacity: 1,
                        pointerEvents: 'auto' as const,
                    }}
                    exit={{
                        height: triggerHeight,
                        scale: 1,
                        opacity: 0,
                        pointerEvents: 'none' as const,
                    }}
                    transition={{
                        height: springConfig,
                        scale: springConfig,
                        opacity: { duration: 0.15 },
                    }}
                    style={{
                        ...style,
                        position: 'absolute',
                        top: triggerTop,
                        left: 0,
                        right: 0,
                        zIndex: 10,
                        overflow: 'hidden',
                        transformOrigin: 'top center',
                        willChange: 'transform, height, opacity',
                        boxSizing: 'content-box',
                    }}
                >
                    {/* Inner wrapper for measuring natural height */}
                    <div ref={measureRef}>
                        {/* Spacer - SubMenuTrigger appears here visually via z-index stacking */}
                        <div style={{ height: triggerHeight }} aria-hidden="true" />

                        {/* Content with fade-in animation */}
                        <motion.div
                            initial="hidden"
                            animate="visible"
                            exit="exit"
                            variants={contentVariants}
                        >
                            {children}
                        </motion.div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
