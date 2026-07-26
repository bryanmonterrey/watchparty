"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { FilterIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { GooDropdown, gooMenuItem, GOO_PANEL_FILL } from "@/components/ui/goo-dropdown";
import { COIN_NETWORKS, networkLabel } from "@/lib/coin-feed/networks";
import { KIND_GROUPS } from "./alert-format";
import { DEFAULT_FILTERS, filtersAreDefault, type AlertFilters } from "./types";
import type { AlertEvent } from "./types";

// The rail's filter control. GooDropdown per the project's dropdown standard —
// dropdown-menu/select primitives are unused here.
//
// Kinds toggle by GROUP (clusters / whales / lifecycle / callouts /
// predictions), because nobody wants "cluster buys" without "cluster sells";
// they want trades without predictions. `kinds: null` means everything, so an
// untouched panel sends no filter at all.

/** Size steps for the amount floor — round numbers a trader actually thinks in. */
const USD_STEPS = [0, 10_000, 50_000, 100_000];
/** Trader-count floor steps. */
const TRADER_STEPS = [0, 10, 20, 50];

const stepLabel = (n: number, suffix: string) =>
    n === 0 ? "any" : n >= 1000 ? `${n / 1000}k+ ${suffix}` : `${n}+ ${suffix}`;

export function AlertFiltersButton({
    filters,
    onChange,
    coverage,
}: {
    filters: AlertFilters;
    onChange: (next: AlertFilters) => void;
    /** Per-network tracked counts, shown so the panel says what's actually covered. */
    coverage?: { network: string; tracked: number }[];
}) {
    const active = !filtersAreDefault(filters);

    const groupActive = (kinds: AlertEvent["kind"][]) =>
        !filters.kinds || kinds.every((k) => filters.kinds!.includes(k));

    const toggleGroup = (kinds: AlertEvent["kind"][]) => {
        // Expand "everything" into an explicit list on first touch, so turning
        // one group off doesn't have to mean listing the other four by hand.
        const all = KIND_GROUPS.flatMap((g) => g.kinds);
        const current = filters.kinds ?? all;
        const on = kinds.every((k) => current.includes(k));
        const next = on ? current.filter((k) => !kinds.includes(k)) : [...new Set([...current, ...kinds])];
        // Back to everything selected → drop the filter entirely.
        onChange({ ...filters, kinds: next.length === all.length ? null : next });
    };

    const toggleNetwork = (id: string) => {
        const enabled = COIN_NETWORKS.filter((n) => n.enabled).map((n) => n.id);
        const current = filters.networks ?? enabled;
        const on = current.includes(id);
        const next = on ? current.filter((n) => n !== id) : [...current, id];
        onChange({ ...filters, networks: next.length === enabled.length ? null : next });
    };

    const check = (on: boolean) =>
        on ? <HugeiconsIcon icon={Tick02Icon} className="size-4 text-white" strokeWidth={2} /> : undefined;

    const items = [
        { type: "label" as const, label: "show" },
        ...KIND_GROUPS.map((g) =>
            gooMenuItem({
                key: g.key,
                label: g.label,
                closeOnSelect: false,
                onClick: () => toggleGroup(g.kinds),
                right: check(groupActive(g.kinds)),
            }),
        ),

        { type: "separator" as const },
        { type: "label" as const, label: "chains" },
        ...COIN_NETWORKS.filter((n) => n.enabled).map((n) => {
            const tracked = coverage?.find((c) => c.network === n.id)?.tracked;
            return gooMenuItem({
                key: n.id,
                label: n.label,
                closeOnSelect: false,
                onClick: () => toggleNetwork(n.id),
                right: (
                    <span className="flex items-center gap-2">
                        {tracked != null && (
                            <span className="text-[13px] font-semibold tabular-nums text-zinc-500">{tracked}</span>
                        )}
                        {check(!filters.networks || filters.networks.includes(n.id))}
                    </span>
                ),
            });
        }),

        { type: "separator" as const },
        { type: "label" as const, label: "min size" },
        ...USD_STEPS.map((v) =>
            gooMenuItem({
                key: `usd-${v}`,
                label: stepLabel(v, "usd"),
                closeOnSelect: false,
                onClick: () => onChange({ ...filters, minUsd: v }),
                right: check(filters.minUsd === v),
            }),
        ),

        { type: "separator" as const },
        { type: "label" as const, label: "min traders" },
        ...TRADER_STEPS.map((v) =>
            gooMenuItem({
                key: `traders-${v}`,
                label: stepLabel(v, "traders"),
                closeOnSelect: false,
                onClick: () => onChange({ ...filters, minTraders: v }),
                right: check(filters.minTraders === v),
            }),
        ),

        { type: "separator" as const },
        gooMenuItem({
            key: "wp-only",
            label: "watchparty coins only",
            closeOnSelect: false,
            onClick: () => onChange({ ...filters, watchpartyOnly: !filters.watchpartyOnly }),
            right: check(filters.watchpartyOnly),
        }),
        ...(active
            ? [
                  { type: "separator" as const },
                  gooMenuItem({
                      key: "reset",
                      label: "reset filters",
                      onClick: () => onChange(DEFAULT_FILTERS),
                  }),
              ]
            : []),
    ];

    return (
        <GooDropdown
            align="start"
            width={248}
            gap={8}
            // The rail is 280px and the panel is 248px — anchoring to the
            // trigger's start keeps it inside the column instead of clipping
            // against the sidebar.
            fill={GOO_PANEL_FILL}
            maxPanelHeight={420}
            triggerAriaLabel="filter alerts"
            triggerClassName={cn(
                "flex h-7 cursor-pointer items-center gap-1.5 rounded-full px-2 text-[13px] font-semibold transition-colors",
                active ? "bg-white/10 text-white" : "text-zinc-500 hover:text-white",
            )}
            trigger={
                <>
                    <HugeiconsIcon icon={FilterIcon} className="size-3.5" strokeWidth={2} />
                    filters
                </>
            }
            items={items}
        />
    );
}

/** Human summary of the active filters, shown under the header when set. */
export function activeFilterSummary(filters: AlertFilters): string | null {
    if (filtersAreDefault(filters)) return null;
    const parts: string[] = [];
    if (filters.kinds?.length) {
        const groups = KIND_GROUPS.filter((g) => g.kinds.every((k) => filters.kinds!.includes(k)));
        parts.push(groups.length ? groups.map((g) => g.label).join(", ") : `${filters.kinds.length} kinds`);
    }
    if (filters.networks?.length) parts.push(filters.networks.map(networkLabel).join(", "));
    if (filters.minUsd > 0) parts.push(`${filters.minUsd / 1000}k+`);
    if (filters.minTraders > 0) parts.push(`${filters.minTraders}+ traders`);
    if (filters.watchpartyOnly) parts.push("watchparty only");
    return parts.join(" · ");
}
