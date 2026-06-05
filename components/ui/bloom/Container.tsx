import {
    useCallback,
    useRef,
    useState,
    useEffect,
    useLayoutEffect,
    type ReactNode,
    type MouseEvent,
    type CSSProperties,
} from 'react'
import { motion } from 'framer-motion'
import { useBloomContext } from './context'
import { useReducedMotion } from './hooks/useReducedMotion'
import { reducedMotionSpring } from './utils/animations'
import type { Direction, Anchor, BloomContainerProps } from './types'

// Calculate base position styles based on direction (trigger stays fixed)
function getPositionStyles(direction: Direction): CSSProperties {
    const styles: CSSProperties = {
        position: 'absolute',
    }

    // Direction determines which edge the trigger anchors to
    switch (direction) {
        case 'top':
            styles.bottom = 0
            styles.left = 0
            break
        case 'bottom':
            styles.top = 0
            styles.left = 0
            break
        case 'left':
            styles.right = 0
            styles.bottom = 0
            break
        case 'right':
            styles.left = 0
            styles.bottom = 0
            break
    }

    return styles
}

// Calculate anchor offset (applied when open to shift menu alignment)
function getAnchorOffset(
    direction: Direction,
    anchor: Anchor,
    menuWidth: number,
    menuHeight: number,
    buttonWidth: number,
    buttonHeight: number
) {
    if (anchor === 'start') {
        return { x: 0, y: 0 }
    }

    const offsetAmount = anchor === 'center' ? 0.5 : 1

    if (direction === 'top' || direction === 'bottom') {
        // Horizontal offset for vertical menus
        const xOffset = -(menuWidth - buttonWidth) * offsetAmount
        return { x: xOffset, y: 0 }
    } else {
        // Vertical offset for horizontal menus
        const yOffset = (menuHeight - buttonHeight) * offsetAmount
        return { x: 0, y: yOffset }
    }
}

// Calculate transform origin based on direction and anchor
function getTransformOrigin(direction: Direction, anchor: Anchor): string {
    const vertical = direction === 'top' ? 'bottom' : direction === 'bottom' ? 'top' : 'center'
    const horizontal = direction === 'left' ? 'right' : direction === 'right' ? 'left' : 'center'

    if (direction === 'top' || direction === 'bottom') {
        const h = anchor === 'start' ? 'left' : anchor === 'end' ? 'right' : 'center'
        return `${h} ${vertical}`
    } else {
        const v = anchor === 'start' ? 'bottom' : anchor === 'end' ? 'top' : 'center'
        return `${horizontal} ${v}`
    }
}

// Calculate animation offset based on direction
function getAnimationOffset(direction: Direction, amount: number) {
    switch (direction) {
        case 'top':
            return { y: -amount }
        case 'bottom':
            return { y: amount }
        case 'left':
            return { x: -amount }
        case 'right':
            return { x: amount }
    }
}

export function Container({
    children,
    buttonSize = 40,
    menuWidth = 200,
    menuRadius = 24,
    buttonRadius,
    className = '',
    style,
}: BloomContainerProps): ReactNode {
    const { open, setOpen, direction, anchor, activeSubmenu, visualDuration, bounce } = useBloomContext()
    const prefersReducedMotion = useReducedMotion()
    const contentRef = useRef<HTMLDivElement>(null)
    const measureRef = useRef<HTMLDivElement>(null)

    // Button dimensions from prop (supports number or { width, height })
    const buttonWidth = typeof buttonSize === 'number' ? buttonSize : buttonSize.width
    const buttonHeight = typeof buttonSize === 'number' ? buttonSize : buttonSize.height
    const [measuredHeight, setMeasuredHeight] = useState<number>(buttonHeight)

    // Track submenu-related styles - need to persist during exit animation
    const [submenuStylesActive, setSubmenuStylesActive] = useState(false)
    const wasSubmenuActiveRef = useRef(false)

    // Delay reverting submenu styles until exit animation completes
    useEffect(() => {
        if (activeSubmenu) {
            wasSubmenuActiveRef.current = true
            setSubmenuStylesActive(true)
        } else if (wasSubmenuActiveRef.current) {
            // Submenu was just closed, delay style changes for exit animation
            const timeout = setTimeout(() => {
                setSubmenuStylesActive(false)
                wasSubmenuActiveRef.current = false
            }, visualDuration * 1000) // Match exit animation duration
            return () => clearTimeout(timeout)
        }
    }, [activeSubmenu, visualDuration])

    // Use spring config for animations (reduced motion aware)
    const springConfig = prefersReducedMotion
        ? { type: 'spring' as const, ...reducedMotionSpring }
        : { type: 'spring' as const, visualDuration, bounce }

    // Measure the inner wrapper's natural height when open
    useLayoutEffect(() => {
        if (open && measureRef.current) {
            const height = measureRef.current.offsetHeight
            setMeasuredHeight(height)
        }
    }, [open])

    const handleClick = useCallback(
        (event: MouseEvent) => {
            if (!open) {
                event.preventDefault()
                setOpen(true)
            }
        },
        [open, setOpen]
    )

    // Default to pill shape (half of smaller dimension)
    const closedRadius = buttonRadius ?? Math.min(buttonWidth, buttonHeight) / 2
    const positionStyles = getPositionStyles(direction)
    const transformOrigin = getTransformOrigin(direction, anchor)
    // Lift amount is 75% of button height
    const liftAmount = buttonHeight * 0.75
    const directionOffset = getAnimationOffset(direction, liftAmount)
    const anchorOffset = getAnchorOffset(direction, anchor, menuWidth, measuredHeight, buttonWidth, buttonHeight)

    // Combine direction offset (lift) with anchor offset (alignment shift)
    const openOffset = {
        x: (directionOffset.x || 0) + anchorOffset.x,
        y: (directionOffset.y || 0) + anchorOffset.y,
    }

    return (
        <div
            style={{
                position: 'relative',
                width: buttonWidth,
                height: buttonHeight,
            }}
        >
            <motion.div
                ref={contentRef}
                onClick={handleClick}
                initial={false}
                animate={{
                    width: open ? menuWidth : buttonWidth,
                    height: open ? measuredHeight : buttonHeight,
                    borderRadius: open ? menuRadius : closedRadius,
                    x: open ? openOffset.x : 0,
                    y: open ? openOffset.y : 0,
                    scale: activeSubmenu ? 0.96 : 1,
                    boxShadow: open
                        ? '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)'
                        : '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
                }}
                transition={springConfig}
                className={className}
                style={{
                    ...positionStyles,
                    overflow: submenuStylesActive ? 'visible' : 'hidden',
                    cursor: open ? 'default' : 'pointer',
                    // Scale from center when submenu is active (and during exit animation)
                    transformOrigin: submenuStylesActive ? 'center center' : transformOrigin,
                    zIndex: open ? 50 : 'auto',
                    willChange: 'transform',
                    ...style,
                }}
            >
                {/* Inner wrapper for accurate height measurement */}
                <div ref={measureRef}>
                    {children}
                </div>
            </motion.div>
        </div>
    )
}
