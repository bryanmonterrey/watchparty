import { useCallback, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useBloomContext } from './context'
import { useReducedMotion } from './hooks/useReducedMotion'
import { reducedMotionSpring } from './utils/animations'
import type { BloomContentProps } from './types'

export function Content({
    children,
    className = '',
    style,
    onAnimationComplete,
}: BloomContentProps): ReactNode {
    const {
        open,
        contentRef,
        animationConfig,
        isOpenAnimationCompleteRef,
        direction,
        visualDuration,
        bounce,
    } = useBloomContext()

    const prefersReducedMotion = useReducedMotion()

    // Content uses slightly shorter duration
    const springConfig = prefersReducedMotion
        ? { type: 'spring' as const, ...reducedMotionSpring }
        : { type: 'spring' as const, visualDuration: visualDuration * 0.85, bounce }

    // Animation offsets based on direction (toward trigger origin)
    const getOffset = (amount: number) => {
        switch (direction) {
            case 'top':
                return { x: 0, y: amount }
            case 'bottom':
                return { x: 0, y: -amount }
            case 'left':
                return { x: amount, y: 0 }
            case 'right':
                return { x: -amount, y: 0 }
        }
    }

    const hiddenOffset = getOffset(8)
    const exitOffset = getOffset(30)

    const contentVariants = {
        visible: {
            opacity: 1,
            scale: 1,
            x: 0,
            y: 0,
            filter: 'blur(0px)',
            transition: {
                ...springConfig,
                delay: prefersReducedMotion ? 0 : animationConfig.contentDelay,
            },
        },
        hidden: {
            opacity: 0,
            scale: 0.95,
            ...hiddenOffset,
            filter: prefersReducedMotion ? 'blur(0px)' : `blur(${animationConfig.contentBlur}px)`,
        },
        exit: {
            opacity: 0,
            scale: 0.9,
            ...exitOffset,
            filter: prefersReducedMotion ? 'blur(0px)' : `blur(${animationConfig.contentBlur}px)`,
            transition: {
                duration: 0.2,
                ease: [0.4, 0, 1, 1] as any,
            },
        },
    }

    const setRef = useCallback(
        (node: HTMLDivElement | null) => {
            contentRef.current = node
        },
        [contentRef]
    )

    const handleAnimationComplete = useCallback(
        (definition: string) => {
            if (definition === 'visible') {
                isOpenAnimationCompleteRef.current = true
            }
            onAnimationComplete?.()
        },
        [isOpenAnimationCompleteRef, onAnimationComplete]
    )

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    ref={setRef}
                    key="bloom-content"
                    role="menu"
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    variants={contentVariants}
                    transition={{
                        ...springConfig,
                        delay: prefersReducedMotion ? 0 : animationConfig.contentDelay,
                    }}
                    onAnimationComplete={handleAnimationComplete}
                    className={className}
                    style={{ position: 'relative', ...style }}
                >
                    {children}
                </motion.div>
            )}
        </AnimatePresence>
    )
}
