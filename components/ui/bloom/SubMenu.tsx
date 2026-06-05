import { useRef, useMemo, type ReactNode } from 'react'
import { SubMenuContext } from './context'
import type { BloomSubMenuProps } from './types'

export function SubMenu({ children, id }: BloomSubMenuProps): ReactNode {
    const triggerRef = useRef<HTMLDivElement>(null)

    const contextValue = useMemo(() => ({ id, triggerRef }), [id])

    return (
        <SubMenuContext.Provider value={contextValue}>
            {children}
        </SubMenuContext.Provider>
    )
}
