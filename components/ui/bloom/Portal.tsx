import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { BloomPortalProps } from './types'

export function Portal({
    children,
    container,
}: BloomPortalProps): ReactNode {
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
        return () => setMounted(false)
    }, [])

    if (!mounted) {
        return null
    }

    const portalContainer = container ?? document.body

    return createPortal(children, portalContainer)
}
