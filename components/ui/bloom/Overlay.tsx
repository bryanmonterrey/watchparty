import { useCallback, type ReactNode, type MouseEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useBloomContext } from './context'
import { useReducedMotion } from './hooks/useReducedMotion'
import { reducedMotionSpring } from './utils/animations'
import type { BloomOverlayProps } from './types'

export function Overlay({
    className = '',
    style,
    onClick,
}: BloomOverlayProps): ReactNode {
    const { open, setOpen, visualDuration, bounce } = useBloomContext()
    const prefersReducedMotion = useReducedMotion()

    const springConfig = prefersReducedMotion
        ? { type: 'spring' as const, ...reducedMotionSpring }
        : { type: 'spring' as const, visualDuration, bounce }

    const handleClick = useCallback(
        (event: MouseEvent) => {
            event.preventDefault()
            if (onClick) {
                onClick()
            } else {
                setOpen(false)
            }
        },
        [onClick, setOpen]
    )

    const overlayVariants = {
        visible: { opacity: 1 },
        hidden: { opacity: 0 },
    }

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    key="bloom-overlay"
                    initial="hidden"
                    animate="visible"
                    exit="hidden"
                    variants={overlayVariants}
                    transition={springConfig}
                    onClick={handleClick}
                    className={className}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        ...style,
                    }}
                    aria-hidden="true"
                />
            )}
        </AnimatePresence>
    )
}
