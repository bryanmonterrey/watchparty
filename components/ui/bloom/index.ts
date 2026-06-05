import { Root } from './Root'
import { Container } from './Container'
import { Trigger } from './Trigger'
import { Content } from './Content'
import { Item } from './Item'
import { Portal } from './Portal'
import { Overlay } from './Overlay'
import { SubMenu } from './SubMenu'
import { SubMenuTrigger } from './SubMenuTrigger'
import { SubMenuContent } from './SubMenuContent'

// Compound component export (primary API)
export const Bloom = {
    Root,
    Container,
    Trigger,
    Content,
    Item,
    Portal,
    Overlay,
    SubMenu,
    SubMenuTrigger,
    SubMenuContent,
}

// Individual component exports
export { Root, Container, Trigger, Content, Item, Portal, Overlay, SubMenu, SubMenuTrigger, SubMenuContent }

// Hook exports (for advanced usage)
export { useBloomContext } from './context'
export { useControllable } from './hooks/useControllable'
export { useClickOutside } from './hooks/useClickOutside'
export { useEscapeKey } from './hooks/useEscapeKey'
export { useReducedMotion } from './hooks/useReducedMotion'

// Type exports
export type {
    BloomRootProps,
    BloomTriggerProps,
    BloomContentProps,
    BloomItemProps,
    BloomPortalProps,
    BloomOverlayProps,
    BloomSubMenuProps,
    BloomSubMenuTriggerProps,
    BloomSubMenuContentProps,
    SpringConfig,
    DetailedAnimationConfig,
    Direction,
    Anchor,
} from './types'

export type { BloomContainerProps } from './types'

// Animation utilities
export {
    transitionConfig,
    contentTransitionConfig,
    reducedMotionSpring,
} from './utils/animations'

export type { TransitionConfig } from './utils/animations'
