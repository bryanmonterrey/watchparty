import { useCallback, useState, useContext, type ReactNode, type MouseEvent } from 'react'
import { motion } from 'framer-motion'
import { useBloomContext, SubMenuContext } from './context'
import { useReducedMotion } from './hooks/useReducedMotion'
import { reducedMotionSpring } from './utils/animations'
import type { BloomItemProps } from './types'

export function Item({
    children,
    onSelect,
    disabled = false,
    closeOnSelect = true,
    className = '',
    style,
}: BloomItemProps): ReactNode {
    const { setOpen, isOpenAnimationCompleteRef, activeSubmenu, visualDuration, bounce } = useBloomContext()
    const subMenuContext = useContext(SubMenuContext)
    const [isHovered, setIsHovered] = useState(false)
    const prefersReducedMotion = useReducedMotion()

    // Only dim if there's an active submenu AND this item is NOT inside that submenu
    const isInsideActiveSubmenu = subMenuContext && activeSubmenu === subMenuContext.id
    const shouldDim = activeSubmenu !== null && !isInsideActiveSubmenu

    const springConfig = prefersReducedMotion
        ? { type: 'spring' as const, ...reducedMotionSpring }
        : { type: 'spring' as const, visualDuration, bounce }

    const handleClick = useCallback(
        (event: MouseEvent) => {
            if (disabled) return
            event.preventDefault()
            onSelect?.()
            if (closeOnSelect) {
                setOpen(false)
            }
        },
        [disabled, onSelect, closeOnSelect, setOpen]
    )

    const handleMouseEnter = useCallback(() => {
        if (!isOpenAnimationCompleteRef.current) return
        if (!disabled) {
            setIsHovered(true)
        }
    }, [disabled, isOpenAnimationCompleteRef])

    const handleMouseLeave = useCallback(() => {
        setIsHovered(false)
    }, [])

    return (
        <motion.div
            role="menuitem"
            aria-disabled={disabled}
            data-disabled={disabled || undefined}
            data-highlighted={isHovered || undefined}
            onClick={handleClick}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            className={className}
            animate={{
                // Only dim opacity - Container already handles the scale
                opacity: shouldDim ? 0.5 : 1,
            }}
            transition={springConfig}
            style={{
                cursor: disabled ? 'not-allowed' : 'pointer',
                transformOrigin: 'center center',
                userSelect: 'none',
                ...style,
            }}
        >
            {children}
        </motion.div>
    )
}
