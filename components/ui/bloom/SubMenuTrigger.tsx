import { useCallback, useState, useEffect, useRef, type ReactNode, type MouseEvent, type KeyboardEvent } from 'react'
import { motion } from 'framer-motion'
import { useBloomContext, useSubMenuContext } from './context'
import { useReducedMotion } from './hooks/useReducedMotion'
import { reducedMotionSpring } from './utils/animations'
import type { BloomSubMenuTriggerProps } from './types'

export function SubMenuTrigger({
    children,
    className = '',
    style,
    disabled = false,
}: BloomSubMenuTriggerProps): ReactNode {
    const { setActiveSubmenu, isOpenAnimationCompleteRef, activeSubmenu, visualDuration, bounce } = useBloomContext()
    const { id, triggerRef } = useSubMenuContext()
    const prefersReducedMotion = useReducedMotion()

    const isActive = activeSubmenu === id

    const springConfig = prefersReducedMotion
        ? { type: 'spring' as const, ...reducedMotionSpring }
        : { type: 'spring' as const, visualDuration, bounce }

    // Scale to pop forward to 1.06 visual (Container is at 0.96, so 0.96 * 1.104 ≈ 1.06)
    const openScale = 1.06 / 0.96 // ≈ 1.104

    // Track elevated state (z-index, transform) separately to persist during exit animation
    const [isElevated, setIsElevated] = useState(false)
    const wasActiveRef = useRef(false)

    useEffect(() => {
        if (isActive) {
            wasActiveRef.current = true
            setIsElevated(true)
        } else if (wasActiveRef.current) {
            // Delay lowering z-index/transform until exit animation completes
            const timeout = setTimeout(() => {
                setIsElevated(false)
                wasActiveRef.current = false
            }, visualDuration * 1000) // Match SubMenuContent exit animation
            return () => clearTimeout(timeout)
        }
    }, [isActive, visualDuration])

    // Toggle behavior - same element opens AND closes
    const handleClick = useCallback(
        (event: MouseEvent) => {
            event.preventDefault()
            event.stopPropagation()
            if (!disabled) {
                setActiveSubmenu(isActive ? null : id)
            }
        },
        [disabled, setActiveSubmenu, id, isActive]
    )

    const handleKeyDown = useCallback(
        (event: KeyboardEvent) => {
            if (disabled) return
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                setActiveSubmenu(isActive ? null : id)
            } else if (event.key === 'ArrowRight' && !isActive) {
                event.preventDefault()
                setActiveSubmenu(id)
            } else if ((event.key === 'ArrowLeft' || event.key === 'Escape') && isActive) {
                event.preventDefault()
                setActiveSubmenu(null)
            }
        },
        [disabled, setActiveSubmenu, id, isActive]
    )

    // Support render prop for dynamic children based on isActive
    const content = typeof children === 'function' ? children(isActive) : children

    return (
        <motion.div
            ref={triggerRef}
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={isActive}
            aria-disabled={disabled || undefined}
            tabIndex={disabled ? -1 : 0}
            data-active={isActive || undefined}
            data-elevated={isElevated || undefined}
            data-highlighted={isOpenAnimationCompleteRef.current ? undefined : undefined}
            className={className}
            initial={false}
            animate={{
                scale: isActive ? openScale : 1,
            }}
            transition={springConfig}
            style={{
                ...style,
                // Z-index stays elevated during exit animation (uses delayed isElevated)
                position: 'relative',
                zIndex: isElevated ? 20 : undefined,
                transformOrigin: 'top center',
                userSelect: 'none',
            }}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
        >
            {content}
        </motion.div>
    )
}
