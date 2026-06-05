import { createContext, useContext } from 'react'
import type { BloomContextValue, BloomSubMenuContextValue } from './types'

export const BloomContext = createContext<BloomContextValue | null>(null)

export function useBloomContext(): BloomContextValue {
    const context = useContext(BloomContext)
    if (!context) {
        throw new Error(
            'Bloom components must be used within a <Bloom.Root> component'
        )
    }
    return context
}

// SubMenu context for passing submenu id to children
export const SubMenuContext = createContext<BloomSubMenuContextValue | null>(null)

export function useSubMenuContext(): BloomSubMenuContextValue {
    const context = useContext(SubMenuContext)
    if (!context) {
        throw new Error(
            'SubMenu components must be used within a <Bloom.SubMenu> component'
        )
    }
    return context
}
