"use client";

import * as React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Tick02Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { SettingsIcon } from "@/components/icons";
import { GooDropdown, gooMenuItem, GOO_PANEL_FILL } from "@/components/ui/goo-dropdown";
import { SLIPPAGE_OPTIONS } from "./buy-format";

// The buy panel's headline number, typeable. It was a read-only figure with
// the presets as the only way to set it — "$10 to $7" could not be done
// (owner, 2026-10-04). Free text while focused, so "7", "7.", "7.5" all
// survive the keystroke; the parsed number is committed on every change and
// the display re-formats on blur. Width follows the digits (ch units) so it
// stays centred without a fixed box.
export function BigAmountInput({
    value,
    onChange,
    prefix,
    suffix,
    format,
    disabled,
    ariaLabel,
}: {
    value: number;
    onChange: (next: number) => void;
    /** "$" for dollars; nothing for token units. */
    prefix?: string;
    /** The token symbol when not priced in dollars. */
    suffix?: string;
    /** How the committed number reads when not being edited. */
    format: (n: number) => string;
    disabled?: boolean;
    ariaLabel: string;
}) {
    const [text, setText] = React.useState<string | null>(null); // null = not editing
    const shown = text ?? format(value);

    return (
        <label className="flex cursor-text items-baseline justify-center text-4xl font-bold leading-none tracking-tight tabular-nums text-white">
            {prefix && <span>{prefix}</span>}
            <input
                type="text"
                inputMode="decimal"
                aria-label={ariaLabel}
                disabled={disabled}
                value={shown}
                size={Math.max(1, shown.length)}
                style={{ width: `${Math.max(1, shown.length) + 0.3}ch` }}
                onFocus={(e) => {
                    setText(value > 0 ? String(value) : "");
                    requestAnimationFrame(() => e.target.select());
                }}
                onChange={(e) => {
                    const raw = e.target.value.replace(/[^0-9.]/g, "");
                    if ((raw.match(/\./g)?.length ?? 0) > 1) return;
                    setText(raw);
                    const n = parseFloat(raw);
                    if (Number.isFinite(n) && n >= 0) onChange(n);
                }}
                onBlur={() => setText(null)}
                className={cn(
                    "min-w-[1ch] bg-transparent text-center outline-none placeholder:text-zinc-600 disabled:opacity-60",
                    "[appearance:textfield]",
                )}
                placeholder="0"
            />
            {suffix && <span className="ml-1.5 text-xl font-bold text-zinc-500">{suffix}</span>}
        </label>
    );
}

// The slippage menu, as a popover off the amount card's corner. Rendered by
// the panel OUTSIDE the card's Squircle (whose clip-path would cut it off).
export function SlippageMenu({ value, onChange }: { value: number; onChange: (bps: number) => void }) {
    return (
        <GooDropdown
            align="end"
            width={220}
            gap={8}
            fill={GOO_PANEL_FILL}
            triggerAriaLabel="Trade settings"
            triggerClassName="cursor-pointer rounded-full p-1 text-zinc-500 transition-colors hover:text-white"
            trigger={<SettingsIcon filled className="size-5" />}
            items={SLIPPAGE_OPTIONS.map((bps) =>
                gooMenuItem({
                    key: bps,
                    label: `${bps / 100}% slippage`,
                    onClick: () => onChange(bps),
                    right: bps === value ? <HugeiconsIcon icon={Tick02Icon} className="size-4 text-white" strokeWidth={2} /> : undefined,
                }),
            )}
        />
    );
}
