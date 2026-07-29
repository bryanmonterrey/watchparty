'use client'

import React from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Squircle } from '@/components/ui/squircle'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/motion/popover'

// Every dropdown in the app is a GooDropdown. The goo itself is now
// @beui/popover (components/motion/popover.tsx, added through the shadcn
// registry), which replaced ~450 lines of hand-rolled geometry that used to
// live in this file — trigger/panel rect math, a clip-path morph, a portal
// layer with a replica trigger, and the spring bookkeeping around it.
//
// The API here is UNCHANGED on purpose: ~70 call sites across ~40 files pass
// `items[]` plus width/align/side/header/maxPanelHeight, and rewriting each
// into beui's compositional <Popover><PopoverTrigger/><PopoverContent/></Popover>
// would be an enormous, risky diff for no user-visible gain. So this file is
// now an ADAPTER — menu semantics (rows, separators, labels, closeOnSelect)
// stay here, motion and goo come from the beui component.
//
// What improved under the hood:
//   · the panel PORTALS to <body>, so a menu near a container edge is no longer
//     clipped. The old one deliberately did NOT portal, which is why call sites
//     near the viewport bottom had to pass side="top" to compensate. Those props
//     still work — they're just no longer load-bearing.
//   · position follows scroll and resize (ResizeObserver + capture-phase
//     scroll), where the old geometry was measured once per open.
//   · the neck is a real SVG goo filter, not a clip-path approximation.
//
// Three props are now no-ops. They're still accepted so no call site breaks;
// see the destructure below for what each one's job was.

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
  /** No-op since the beui popover — see the destructure. */
  shift?: number
  side?: 'top' | 'bottom'
  /** Distance between trigger and panel — the goo bridges this. */
  gap?: number
  itemHeight?: number
  /** Clamp the panel height; items scroll inside when content exceeds it. */
  maxPanelHeight?: number
  disabled?: boolean
  /** No-op since the beui popover — see the destructure. */
  buttonRadius?: number
  panelRadius?: number
  fill?: string
  gooStrength?: number
  /** No-op since the beui popover — see the destructure. */
  spring?: SpringConfig
  className?: string
}

const PANEL_PAD = 8
const SEPARATOR_ROW_H = 12

// Row corner radius. Rows are SQUIRCLED (Lisse clip-path), not rounded-* —
// owner call 2026-07-22: "i didn't want everything rounded full, i wanted all
// corners squircled".
const ROW_RADIUS = 16

// ── THE dropdown standard (design-principles §Dropdowns) ────────────────────
// Every menu in the app is a GooDropdown built from these, so they can't
// drift: 44px (h-11) SQUIRCLED rows, text-base font-bold, #0a0a0a panel,
// radius 24 (the component defaults), and an h-11 pill trigger. Pass a
// pre-rendered icon node (lucide or HugeiconsIcon — builder is icon-system
// agnostic) and an optional `right` slot for checkmarks/badges.

/** Standard pill trigger for dropdowns (h-11, matches the button standard). */
export const GOO_TRIGGER_PILL =
  'flex h-11 cursor-pointer items-center gap-2 rounded-full bg-soft-gray-10 px-4 text-base font-bold text-zinc-400 transition-colors hover:text-flexwhite'

/** Standard panel fill — pair with the default panelRadius/itemHeight. */
export const GOO_PANEL_FILL = '#111111ff'

export function gooMenuItem({ icon, label, onClick, href, right, variant = 'default', closeOnSelect = true, key }: {
  icon?: React.ReactNode
  label: React.ReactNode
  onClick?: () => void
  href?: string
  /** Right-aligned slot (active checkmark, count, badge). */
  right?: React.ReactNode
  variant?: 'default' | 'danger'
  closeOnSelect?: boolean
  key?: string | number
}): GooDropdownItem {
  return {
    key: key ?? (typeof label === 'string' ? label : undefined),
    onClick,
    href,
    closeOnSelect,
    className: cn(
      // No rounded-* — the row is squircled by the component (clip-path).
      'gap-3 px-4 py-1.5 cursor-pointer text-lg font-bold group',
      variant === 'danger'
        ? 'text-red-500 hover:bg-red-500/10 hover:text-red-500'
        : 'text-zinc-200 hover:bg-white/5 hover:text-white',
    ),
    label: (
      <>
        {icon && (
          <span className={cn(
            'shrink-0 transition-colors [&_svg]:size-[18px]',
            variant === 'danger' ? 'text-red-500' : 'text-white',
          )}>
            {icon}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        {right && <span className="shrink-0">{right}</span>}
      </>
    ),
  }
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
  width = 450,
  align = 'end',
  side = 'bottom',
  gap = 14,
  itemHeight = 52,
  maxPanelHeight,
  disabled = false,
  panelRadius = 24,
  fill = GOO_PANEL_FILL,
  gooStrength = 8,
  className,
  // Accepted and ignored — the beui popover owns motion and geometry now:
  //   spring       → its own GOO_OPEN_SPRING / GOO_CLOSE_SPRING
  //   buttonRadius → derived from the trigger's measured height
  //   shift        → align start/end covers every current call site
  spring: _spring,
  buttonRadius: _buttonRadius,
  shift: _shift,
}: GooDropdownProps) {
  const [uncontrolled, setUncontrolled] = React.useState(false)
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : uncontrolled

  const setOpen = React.useCallback((next: boolean) => {
    if (!isControlled) setUncontrolled(next)
    onOpenChange?.(next)
  }, [isControlled, onOpenChange])

  const rowHeight = (item: GooDropdownItem) =>
    item.height ?? (item.type === 'separator' ? SEPARATOR_ROW_H : itemHeight)

  const select = (item: GooDropdownItem) => {
    item.onClick?.()
    if (item.closeOnSelect !== false) setOpen(false)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => { if (!disabled) setOpen(next) }}
      align={align}
      side={side}
      sideOffset={gap}
      panelRadius={panelRadius}
      gooStrength={gooStrength}
      fill={fill}
      className={className}
    >
      <PopoverTrigger>
        <button
          type="button"
          aria-label={triggerAriaLabel}
          disabled={disabled}
          className={cn(
            'outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
            triggerClassName,
            disabled && 'pointer-events-none opacity-50',
          )}
          onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}
        >
          {trigger}
        </button>
      </PopoverTrigger>

      {/* The popover ships p-4 and max-w-[min(92vw,20rem)] for prose panels;
          a menu is neither — rows are full-bleed and the width is the caller's.
          PANEL_PAD is the inset the rows actually sit in. */}
      <PopoverContent className="max-w-none p-0">
        <div
          role="menu"
          onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}
          className="flex flex-col"
          style={{ width, padding: PANEL_PAD, maxHeight: maxPanelHeight }}
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
                    <div className={cn('h-px w-full bg-border/10', item.className)} />
                  </div>
                )
              }

              if (item.type === 'custom') {
                // Squircled like every other row. Safe for rows whose component
                // opens a dialog — Radix portals to <body>, so clip-path here
                // never clips it.
                return (
                  <Squircle key={k} asChild radius={ROW_RADIUS}>
                    <div className={cn('shrink-0 overflow-hidden', item.className)} style={{ height: h }}>
                      {item.label}
                    </div>
                  </Squircle>
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

              // The BASE row IS the app standard (design-principles §1.2):
              // SQUIRCLED rows (never rounded-*, which is redundant under Lisse's
              // clip-path), px-4, text-base font-bold, zinc-200 → white on hover.
              // A call site can still override via item.className, but it no
              // longer has to style rows at all.
              const rowClass = cn(
                'flex w-full shrink-0 items-center px-4 py-2 text-left text-base font-bold text-zinc-200 transition-colors duration-150 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:bg-white/5 focus-visible:text-white',
                item.className,
              )

              return (
                <Squircle key={k} asChild radius={ROW_RADIUS}>
                  {item.href ? (
                    <Link
                      role="menuitem"
                      tabIndex={open ? 0 : -1}
                      href={item.href}
                      onClick={() => select(item)}
                      className={rowClass}
                      style={{ height: h }}
                    >
                      {item.label}
                    </Link>
                  ) : (
                    <button
                      role="menuitem"
                      type="button"
                      tabIndex={open ? 0 : -1}
                      onClick={() => select(item)}
                      className={rowClass}
                      style={{ height: h }}
                    >
                      {item.label}
                    </button>
                  )}
                </Squircle>
              )
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export default GooDropdown
