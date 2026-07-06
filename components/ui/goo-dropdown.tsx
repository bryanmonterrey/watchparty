'use client'

import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { animate, useMotionValue, useMotionValueEvent, useReducedMotion } from 'motion/react'
import { cn } from '@/lib/utils'

export type GooDropdownItem = {
  key?: string | number
  type?: 'item' | 'label' | 'separator'
  label?: React.ReactNode
  onClick?: () => void
  href?: string
  className?: string
  height?: number
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
  visualDuration: 0.3,
  bounce: 0.15,
}

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
  const [open, setOpen] = useState(false)
  const [elevated, setElevated] = useState(false)
  const shouldReduceMotion = useReducedMotion()
  const filterId = useId().replace(/[:]/g, '')

  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  const [btn, setBtn] = useState({ w: 78, h: 34 })

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

  const progress = useMotionValue(0)

  useMotionValueEvent(progress, 'change', (v) => {
    const shape = shapeAt(v)
    if (panelRef.current) panelRef.current.style.clipPath = shape
    if (contentRef.current) contentRef.current.style.clipPath = shape
    if (v === 0) setElevated(false)
  })

  useEffect(() => {
    if (open) setElevated(true)
    if (shouldReduceMotion) {
      progress.set(open ? 1 : 0)
      return
    }
    const config = {
      ...spring,
      visualDuration: open
        ? (spring.visualDuration ?? 0.3)
        : spring.visualDuration
          ? spring.visualDuration * 0.7
          : 0.2,
    }
    const animation = animate(progress, open ? 1 : 0, config)
    return () => animation.stop()
  }, [open, progress, spring, shouldReduceMotion])

  useEffect(() => {
    if (disabled) setOpen(false)
  }, [disabled])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
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
    setOpen(false)
  }

  // Read the current shape during render so re-renders while open don't snap
  // the inline clip-path back to the closed state.
  const currentShape = shapeAt(progress.get())

  const overlayPos: React.CSSProperties = {
    left: -geo.btnX,
    top: -geo.btnY,
    width: geo.layerW,
    height: geo.layerH,
  }

  return (
    <div ref={rootRef} className={cn('relative inline-flex select-none', className)}>
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
          ...overlayPos,
          filter: shouldReduceMotion ? 'none' : `url(#${filterId})`,
          zIndex: elevated ? 50 : 0,
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
          className="absolute inset-0 will-change-[clip-path]"
          style={{ background: fill, clipPath: currentShape }}
        />
      </div>

      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={triggerAriaLabel}
        className={cn(
          'relative outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
          triggerClassName,
        )}
        style={{ zIndex: elevated ? 51 : 1 }}
      >
        {trigger}
      </button>

      <div
        ref={contentRef}
        role="menu"
        className="absolute will-change-[clip-path]"
        style={{
          ...overlayPos,
          clipPath: currentShape,
          pointerEvents: open ? 'auto' : 'none',
          zIndex: elevated ? 52 : 0,
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
}

export default GooDropdown
