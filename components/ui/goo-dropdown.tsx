'use client'

import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useReducedMotion } from 'motion/react'
import { cn } from '@/lib/utils'

export type GooDropdownItem = {
  key?: string | number
  /** 'custom' renders the label node bare (no button wrapper) — for rows that are interactive components themselves. */
  type?: 'item' | 'label' | 'separator' | 'custom'
  label?: React.ReactNode
  onClick?: () => void
  href?: string
  className?: string
  height?: number
  /** Set false to keep the menu open after clicking (view switches, async flows). */
  closeOnSelect?: boolean
}

type SpringConfig = {
  type: 'spring'
  stiffness?: number
  damping?: number
  mass?: number
  bounce?: number
  visualDuration?: number
}

export type GooDropdownProps = {
  /** Content of the trigger button (the component renders its own <button>). */
  trigger: React.ReactNode
  triggerClassName?: string
  triggerAriaLabel?: string
  items: GooDropdownItem[]
  /** Controlled open state; omit for uncontrolled. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Stop click events from bubbling out (for menus inside clickable cards). */
  stopPropagation?: boolean
  /** Optional fixed-height header rendered above the items. */
  header?: React.ReactNode
  headerHeight?: number
  /** Panel width in px. */
  width?: number
  align?: 'start' | 'end'
  side?: 'top' | 'bottom'
  /** Distance between trigger and panel — the goo bridges this. */
  gap?: number
  itemHeight?: number
  /** Clamp the panel height; items scroll inside when content exceeds it. */
  maxPanelHeight?: number
  disabled?: boolean
  buttonRadius?: number
  panelRadius?: number
  fill?: string
  gooStrength?: number
  spring?: SpringConfig
  className?: string
}

const PANEL_PAD = 6
const SEPARATOR_ROW_H = 9

const DEFAULT_SPRING: SpringConfig = {
  type: 'spring',
  visualDuration: 0.22,
  bounce: 0.15,
}

// The morph runs on native CSS clip-path transitions (compositor-driven —
// no per-frame JS). Open gets a springy overshoot; close is a quick ease.
const OPEN_EASE = 'cubic-bezier(0.34, 1.3, 0.64, 1)'
const CLOSE_EASE = 'cubic-bezier(0.4, 0, 0.68, 1)'

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** Rounded rect (x,y,w,h,r) inside a layer of (W,H) as a clip-path inset(). */
function roundedRectInset(x: number, y: number, w: number, h: number, r: number, W: number, H: number) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2))
  const p = (n: number) => `${n.toFixed(2)}px`
  return `inset(${p(y)} ${p(W - x - w)} ${p(H - y - h)} ${p(x)} round ${p(radius)})`
}

export function GooDropdown({
  trigger,
  triggerClassName,
  triggerAriaLabel,
  items,
  open: controlledOpen,
  onOpenChange,
  stopPropagation = false,
  header,
  headerHeight = 48,
  width = 240,
  align = 'end',
  side = 'bottom',
  gap = 14,
  itemHeight = 40,
  maxPanelHeight,
  disabled = false,
  buttonRadius,
  panelRadius = 20,
  fill = 'var(--color-card)',
  gooStrength = 8,
  spring = DEFAULT_SPRING,
  className,
}: GooDropdownProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : uncontrolledOpen
  const setOpen = (next: boolean) => {
    if (!isControlled) setUncontrolledOpen(next)
    onOpenChange?.(next)
  }
  const [elevated, setElevated] = useState(false)
  const shouldReduceMotion = useReducedMotion()
  const filterId = useId().replace(/[:]/g, '')

  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const portalRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  const [btn, setBtn] = useState({ w: 78, h: 34 })
  // Trigger's viewport position — the portal layer is fixed-positioned off it,
  // so the panel lives outside the page flow and can never add scroll space.
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    const el = triggerRef.current
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      const w = Math.round(r.width)
      const h = Math.round(r.height)
      setBtn((prev) => (prev.w === w && prev.h === h ? prev : { w, h }))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const rowHeight = (item: GooDropdownItem) =>
    item.height ?? (item.type === 'separator' ? SEPARATOR_ROW_H : itemHeight)

  const geo = useMemo(() => {
    const contentH = PANEL_PAD * 2 + (header ? headerHeight : 0) + items.reduce((s, it) => s + rowHeight(it), 0)
    const panelH = maxPanelHeight ? Math.min(contentH, maxPanelHeight) : contentH
    const layerW = Math.max(width, btn.w)
    const btnX = align === 'end' ? layerW - btn.w : 0
    const panelX = align === 'end' ? layerW - width : 0
    const btnY = side === 'top' ? panelH + gap : 0
    const panelY = side === 'top' ? 0 : btn.h + gap
    const layerH = panelH + gap + btn.h
    const closedR = buttonRadius ?? btn.h / 2
    return {
      layerW,
      layerH,
      panelH,
      panelX,
      panelY,
      btnX,
      btnY,
      closedRect: { x: btnX, y: btnY, w: btn.w, h: btn.h, r: closedR },
      openRect: { x: panelX, y: panelY, w: width, h: panelH, r: panelRadius },
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, header, headerHeight, width, align, side, gap, itemHeight, maxPanelHeight, buttonRadius, panelRadius, btn.w, btn.h])

  const shapeAt = useMemo(() => {
    const { closedRect, openRect, layerW, layerH } = geo
    return (t: number) =>
      roundedRectInset(
        lerp(closedRect.x, openRect.x, t),
        lerp(closedRect.y, openRect.y, t),
        lerp(closedRect.w, openRect.w, t),
        lerp(closedRect.h, openRect.h, t),
        lerp(closedRect.r, openRect.r, t),
        layerW,
        layerH,
      )
  }, [geo])

  // Rendered shape target: false = trigger pill, true = open panel. The
  // browser interpolates between the two inset() clip-paths natively.
  const [shown, setShown] = useState(false)

  // Fully open + at rest: the goo blur would keep bridging trigger → panel
  // with a visible neck, so drop the filter once the morph settles and
  // restore it the moment the shape animates again.
  const [settled, setSettled] = useState(false)

  const openDur = spring.visualDuration ?? 0.22
  const closeDur = openDur * 0.65

  useEffect(() => {
    if (open) {
      setElevated(true)
      if (shouldReduceMotion) {
        setShown(true)
        setSettled(true)
        return
      }
      // Let the layer mount and paint the closed shape first, then retarget —
      // otherwise the transition has no start frame and the panel just pops.
      let raf2 = 0
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setShown(true))
      })
      return () => {
        cancelAnimationFrame(raf1)
        cancelAnimationFrame(raf2)
      }
    }
    setShown(false)
    setSettled(false)
    if (shouldReduceMotion) setElevated(false)
  }, [open, shouldReduceMotion])

  // transitionend unmounts the layer after close; this is the backstop for
  // the cases where it never fires (ancestor hidden mid-close, etc.).
  useEffect(() => {
    if (open || shouldReduceMotion || !elevated) return
    const t = setTimeout(() => setElevated(false), closeDur * 1000 + 150)
    return () => clearTimeout(t)
  }, [open, shouldReduceMotion, elevated, closeDur])

  const handleShapeEnd = (e: React.TransitionEvent<HTMLDivElement>) => {
    if (e.propertyName !== 'clip-path' || e.target !== e.currentTarget) return
    if (open) setSettled(true)
    else setElevated(false)
  }

  useEffect(() => {
    if (disabled) setOpen(false)
  }, [disabled])

  // Anchor the portal to the trigger: measure before paint when the layer
  // mounts, and follow the trigger through scroll/resize while visible.
  useLayoutEffect(() => {
    if (!elevated) return
    const measure = () => {
      const r = triggerRef.current?.getBoundingClientRect()
      if (r) {
        setAnchor((prev) =>
          prev && prev.left === r.left && prev.top === r.top ? prev : { left: r.left, top: r.top },
        )
      }
    }
    measure()
    window.addEventListener('scroll', measure, { capture: true, passive: true })
    window.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('scroll', measure, { capture: true })
      window.removeEventListener('resize', measure)
    }
  }, [elevated])

  // Keep pre-click events inside the portal from reaching document-level
  // dismiss listeners (Radix dialogs close on "outside" pointerdown/focusin).
  // NOT 'click': React's delegated listeners sit on document.body, and
  // stopping click before body would swallow the items' own onClick.
  useEffect(() => {
    const el = portalRef.current
    if (!el || !elevated) return
    const stop = (e: Event) => e.stopPropagation()
    const events = ['pointerdown', 'mousedown', 'touchstart', 'focusin'] as const
    events.forEach((ev) => el.addEventListener(ev, stop))
    return () => events.forEach((ev) => el.removeEventListener(ev, stop))
  }, [elevated])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (rootRef.current?.contains(t) || portalRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const select = (item: GooDropdownItem) => {
    item.onClick?.()
    if (item.closeOnSelect !== false) setOpen(false)
  }

  // The style only ever carries the *target* shape; the browser owns the
  // interpolation, so re-renders while open can never snap it back.
  const targetShape = shapeAt(shown ? 1 : 0)
  const shapeTransition = shouldReduceMotion
    ? undefined
    : `clip-path ${shown ? openDur : closeDur}s ${shown ? OPEN_EASE : CLOSE_EASE}`

  const layer = elevated && anchor && (
    <div
      ref={portalRef}
      onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}
      className="select-none"
      style={{
        position: 'fixed',
        left: anchor.left - geo.btnX,
        top: anchor.top - geo.btnY,
        width: 0,
        height: 0,
        zIndex: 60,
        pointerEvents: 'none',
      }}
    >
      <svg className="absolute h-0 w-0" aria-hidden>
        <defs>
          <filter id={filterId}>
            <feGaussianBlur in="SourceGraphic" stdDeviation={gooStrength} result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10"
              result="goo"
            />
            <feComposite in="SourceGraphic" in2="goo" operator="atop" />
          </filter>
        </defs>
      </svg>

      <div
        aria-hidden
        className="pointer-events-none absolute"
        style={{
          left: 0,
          top: 0,
          width: geo.layerW,
          height: geo.layerH,
          filter: shouldReduceMotion || settled ? 'none' : `url(#${filterId})`,
        }}
      >
        <div
          className="absolute"
          style={{
            left: geo.btnX,
            top: geo.btnY,
            width: btn.w,
            height: btn.h,
            borderRadius: geo.closedRect.r,
            background: fill,
          }}
        />
        <div
          ref={panelRef}
          onTransitionEnd={handleShapeEnd}
          className="absolute inset-0 will-change-[clip-path]"
          style={{ background: fill, clipPath: targetShape, transition: shapeTransition }}
        />
      </div>

      {/* Non-interactive replica of the trigger so its label rides above the
          goo fill; the real (invisible) trigger below still takes the clicks. */}
      <span
        aria-hidden
        aria-expanded={open}
        className={cn('pointer-events-none absolute', triggerClassName)}
        style={{ left: geo.btnX, top: geo.btnY, width: btn.w, height: btn.h }}
      >
        {trigger}
      </span>

      <div
        ref={contentRef}
        role="menu"
        className="absolute will-change-[clip-path]"
        style={{
          left: 0,
          top: 0,
          width: geo.layerW,
          height: geo.layerH,
          clipPath: targetShape,
          transition: shapeTransition,
          pointerEvents: open ? 'auto' : 'none',
        }}
      >
        <div
          className="absolute flex flex-col"
          style={{
            left: geo.panelX,
            top: geo.panelY,
            width,
            height: geo.panelH,
            padding: PANEL_PAD,
          }}
        >
          {header && (
            <div className="shrink-0" style={{ height: headerHeight }}>
              {header}
            </div>
          )}
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {items.map((item, i) => {
            const h = rowHeight(item)
            const k = item.key ?? i
            if (item.type === 'separator') {
              return (
                <div key={k} className="flex shrink-0 items-center px-2" style={{ height: h }}>
                  <div className={cn('h-px w-full bg-border/60', item.className)} />
                </div>
              )
            }
            if (item.type === 'custom') {
              return (
                <div key={k} className={cn('shrink-0', item.className)} style={{ height: h }}>
                  {item.label}
                </div>
              )
            }
            if (item.type === 'label') {
              return (
                <div
                  key={k}
                  className={cn(
                    'flex shrink-0 items-center px-3 text-xs font-semibold text-muted-foreground',
                    item.className,
                  )}
                  style={{ height: h }}
                >
                  {item.label}
                </div>
              )
            }
            const rowClass = cn(
              'flex w-full shrink-0 items-center rounded-[14px] px-3 text-left text-sm transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:bg-accent focus-visible:text-accent-foreground',
              item.className,
            )
            if (item.href) {
              return (
                <Link
                  key={k}
                  role="menuitem"
                  tabIndex={open ? 0 : -1}
                  href={item.href}
                  onClick={() => select(item)}
                  className={rowClass}
                  style={{ height: h }}
                >
                  {item.label}
                </Link>
              )
            }
            return (
              <button
                key={k}
                role="menuitem"
                type="button"
                tabIndex={open ? 0 : -1}
                onClick={() => select(item)}
                className={rowClass}
                style={{ height: h }}
              >
                {item.label}
              </button>
            )
          })}
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div
      ref={rootRef}
      className={cn('relative inline-flex select-none', className)}
      onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}
    >
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={triggerAriaLabel}
        className={cn(
          'relative outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
          triggerClassName,
        )}
        // While the portal layer is up, its replica renders the trigger's
        // visuals; the real button stays (invisible) purely for interaction.
        style={{ opacity: elevated ? 0 : 1 }}
      >
        {trigger}
      </button>

      {layer && createPortal(layer, document.body)}
    </div>
  )
}

export default GooDropdown
