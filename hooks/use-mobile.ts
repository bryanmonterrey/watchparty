import * as React from "react"

const MOBILE_BREAKPOINT = 768

// Like useIsMobile, but undefined until the viewport is actually measured
// (post-mount). Use when guessing is expensive — e.g. picking which lazy
// bundle to load: coercing undefined to false would start the desktop
// download on phones before the flip.
export function useIsMobileOrUndefined() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return isMobile
}

export function useIsMobile() {
  return !!useIsMobileOrUndefined()
}
