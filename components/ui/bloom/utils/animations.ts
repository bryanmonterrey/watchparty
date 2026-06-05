import type { SpringConfig } from '../types'

// Spring transition configuration using visual duration
export type TransitionConfig = { type: 'spring'; visualDuration: number; bounce: number }

// Default spring animation
export const transitionConfig: TransitionConfig = {
    type: 'spring',
    visualDuration: 0.25,
    bounce: 0.2,
}

// Content animation (slightly longer for fade-in)
export const contentTransitionConfig: TransitionConfig = {
    type: 'spring',
    visualDuration: 0.3,
    bounce: 0.2,
}

// Reduced motion spring (instant)
export const reducedMotionSpring: SpringConfig = {
    stiffness: 1000,
    damping: 100,
}

// Default content enter delay (ms)
export const CONTENT_ENTER_DELAY = 0.08

// Blur amounts
export const TRIGGER_BLUR = 8
export const CONTENT_BLUR = 8
