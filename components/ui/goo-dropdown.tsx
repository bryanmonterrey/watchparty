'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { LiquidPopover, type LiquidPopoverItem } from '@/components/liquid/liquid-popover'

// Every dropdown in the app is a GooDropdown. The engine is the LIQUID
// POPOVER (components/liquid/liquid-popover.tsx) — liquid-taffy's anchored
// dropdown on the app's dark frame, adopted app-wide (owner call 2026-08-20):
// the panel pours out of its trigger as goo, dives back in on close, the
// trigger and panel can be grabbed and stretched like taffy, hover travels as
// one pill under the rows, and every gesture makes a quiet synthesized sound
// (mute with `gooSfx.mute()` from components/liquid/sfx.ts).
//
// It replaced @beui/popover-morph (components/motion/popover-morph.tsx, still
// used directly by wallet-drawer2), which had itself replaced the original
// fused-goo popover. The 2026-07-29 objection to that one — a permanent neck
// tethering every menu to its button — does not apply here: at REST the liquid
// panel is a separate crisp squircle with a real border; the goo exists only
// while the picture is in motion.
//
// The API here is UNCHANGED on purpose: ~70 call sites across ~40 files pass
// `items[]` plus width/align/side/header/maxPanelHeight, and the liquid engine
// speaks that API natively. This file is a thin adapter that keeps the item
// builder + the trigger/panel style constants where every call site imports
// them from.
//
// One behavioural difference from the beui engine: the panel does NOT portal
// to <body> — the goo, the panel and the trigger must live in one coordinate
// space for the pour and the grab to be one picture. A menu hard against a
// scroll-container edge may need side="top" again (those props all still
// work, and many call sites never dropped them).
//
// Four props are still accepted and ignored so no call site breaks:
// spring / buttonRadius / shift / gooStrength — see the destructure.

export type GooDropdownItem = LiquidPopoverItem

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
  align?: 'start' | 'center' | 'end'
  /** Shift along the align axis, in px. */
  alignOffset?: number
  /** No-op — kept so call sites compile. */
  shift?: number
  side?: 'top' | 'bottom'
  /** Distance between trigger and panel — the pour crosses this. */
  gap?: number
  itemHeight?: number
  /** Clamp the panel height; items scroll inside when content exceeds it. */
  maxPanelHeight?: number
  disabled?: boolean
  /** No-op — kept so call sites compile. */
  buttonRadius?: number
  panelRadius?: number
  fill?: string
  gooStrength?: number
  /** No-op — kept so call sites compile. */
  spring?: SpringConfig
  className?: string
}

/** Standard pill trigger for dropdowns (h-11, matches the button standard). */
export const GOO_TRIGGER_PILL =
  'flex h-11 cursor-pointer items-center gap-2 rounded-full bg-soft-gray-10 px-4 text-base font-bold text-zinc-400 transition-colors hover:text-flexwhite'

/** Standard panel fill — the ORIGINAL GooDropdown black, back by owner call
 * (2026-08-20, same day): the liquid engine stays — motion, seam, neon — but
 * the surface reverts from the demo's #212326 stage grey to the panel colour
 * every dropdown wore before the engine swap. The rim needs no edit:
 * solidRim() sees a non-demo fill and derives ~6.5% white over the face. */
export const GOO_PANEL_FILL = '#111111'

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
      // No rounded-* — the row is squircled by the engine (clip-path).
      // No hover:bg either: the hover FILL is the liquid engine's travelling
      // pill, one highlight for the whole list. Danger keeps its red tint —
      // that hover is semantic, not just "you are here".
      'gap-3 px-4 py-1.5 cursor-pointer text-lg font-bold group',
      variant === 'danger'
        ? 'text-red-500 hover:bg-red-500/10 hover:text-red-500'
        : 'text-zinc-200 hover:text-white',
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
  open,
  onOpenChange,
  stopPropagation = false,
  header,
  headerHeight = 48,
  width = 450,
  align = 'end',
  alignOffset,
  side = 'bottom',
  gap = 14,
  itemHeight = 52,
  maxPanelHeight,
  disabled = false,
  panelRadius = 24,
  fill = GOO_PANEL_FILL,
  className,
  // Accepted and ignored — the liquid engine owns motion and geometry:
  //   spring       → the family's sampled physical springs (liquid/springs.ts)
  //   buttonRadius → the trigger blob is measured off the real button
  //   shift        → align start/end + alignOffset covers every call site
  //   gooStrength  → the goo's blur/threshold pairs are solved, not tunable
  spring: _spring,
  buttonRadius: _buttonRadius,
  shift: _shift,
  gooStrength: _gooStrength,
}: GooDropdownProps) {
  return (
    <LiquidPopover
      trigger={trigger}
      triggerClassName={triggerClassName}
      triggerAriaLabel={triggerAriaLabel}
      items={items}
      open={open}
      onOpenChange={onOpenChange}
      stopPropagation={stopPropagation}
      header={header}
      headerHeight={headerHeight}
      width={width}
      align={align}
      alignOffset={alignOffset}
      side={side}
      gap={gap}
      itemHeight={itemHeight}
      maxPanelHeight={maxPanelHeight}
      disabled={disabled}
      panelRadius={panelRadius}
      fill={fill}
      className={className}
    />
  )
}

export default GooDropdown
