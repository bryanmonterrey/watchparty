"use client";

import * as React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowUp01Icon, ArrowDown01Icon, Cancel01Icon, LinkSquare02Icon, Settings02Icon } from "@hugeicons/core-free-icons";

import { StreamChat } from "@/components/studio/stream-chat";
import { ActivityFeed } from "@/components/studio/activity-feed";
import { ModActionsFeed } from "@/components/studio/mod-actions-feed";
import { POPOUT_SIZE, POPOUT_TITLE, POPOUT_PANELS, type PopoutPanelKey } from "@/components/studio/popout-panel";

// The cockpit's widget rail — the S6 "customizable panel grid (add/remove/
// reorder + reset) + pop-out widgets", scoped to the live panels.
//
// SCOPED DELIBERATELY. The left column's cards (preview, go-live, ingest,
// stream info) are a SETUP sequence — reordering "generate a key" above "point
// your encoder at it" makes the page worse, not personal. The right rail is
// the part a creator watches for hours, on their own monitor arrangement, and
// that is what layout preferences are for.
//
// Persisted in localStorage, not the database: it is a per-DEVICE preference —
// the same creator on a laptop and a two-monitor desk wants different answers,
// and a synced value would fight itself between them.

const STORAGE_KEY = "wp.studio.rail.v1";

type Layout = { order: PopoutPanelKey[]; hidden: PopoutPanelKey[] };

const DEFAULT_LAYOUT: Layout = { order: [...POPOUT_PANELS], hidden: [] };

/** Tolerant read: a corrupt or stale value resets rather than throwing. */
function loadLayout(): Layout {
    if (typeof window === "undefined") return DEFAULT_LAYOUT;
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return DEFAULT_LAYOUT;
        const parsed = JSON.parse(raw) as Partial<Layout>;
        const known = (list: unknown): PopoutPanelKey[] =>
            Array.isArray(list)
                ? (list.filter((k): k is PopoutPanelKey => POPOUT_PANELS.includes(k as PopoutPanelKey)))
                : [];
        const order = known(parsed.order);
        // A panel added in a later release is missing from a saved order —
        // append it rather than dropping it, or new panels would be invisible
        // to everyone who ever touched their layout.
        for (const key of POPOUT_PANELS) if (!order.includes(key)) order.push(key);
        return { order, hidden: known(parsed.hidden) };
    } catch {
        return DEFAULT_LAYOUT;
    }
}

function IconButton({
    label,
    icon,
    onClick,
    disabled,
}: {
    label: string;
    icon: typeof ArrowUp01Icon;
    onClick: () => void;
    disabled?: boolean;
}) {
    return (
        <button
            type="button"
            aria-label={label}
            title={label}
            onClick={onClick}
            disabled={disabled}
            className="text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
        >
            <HugeiconsIcon icon={icon} className="size-3.5" />
        </button>
    );
}

export function PanelRail({ userId, isLive, hasChatRoom }: { userId: string | undefined; isLive: boolean; hasChatRoom: boolean }) {
    // Mount with the DEFAULT and adopt the stored layout in an effect: reading
    // localStorage during render makes the server and client disagree, and the
    // hydration mismatch is a whole rail flickering into a different order.
    const [layout, setLayout] = React.useState<Layout>(DEFAULT_LAYOUT);
    const [hydrated, setHydrated] = React.useState(false);
    const [editing, setEditing] = React.useState(false);

    React.useEffect(() => {
        setLayout(loadLayout());
        setHydrated(true);
    }, []);

    const save = React.useCallback((next: Layout) => {
        setLayout(next);
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
            // Private mode, or a full quota. The layout still applies for this
            // session; only its memory is lost.
        }
    }, []);

    const move = (key: PopoutPanelKey, delta: -1 | 1) => {
        const order = [...layout.order];
        const at = order.indexOf(key);
        const to = at + delta;
        if (at < 0 || to < 0 || to >= order.length) return;
        [order[at], order[to]] = [order[to], order[at]];
        save({ ...layout, order });
    };

    const toggle = (key: PopoutPanelKey) => {
        const hidden = layout.hidden.includes(key)
            ? layout.hidden.filter((k) => k !== key)
            : [...layout.hidden, key];
        save({ ...layout, hidden });
    };

    const popOut = (key: PopoutPanelKey) => {
        const { w, h } = POPOUT_SIZE[key];
        window.open(
            `/studio/popout/${key}`,
            // Named per panel, so clicking pop-out twice focuses the window
            // that is already open instead of stacking duplicates.
            `wp-studio-${key}`,
            `popup=yes,width=${w},height=${h}`,
        );
    };

    const visible = layout.order.filter((k) => !layout.hidden.includes(k));

    const controls = (key: PopoutPanelKey) => (
        <div className="flex items-center gap-2">
            {editing ? (
                <>
                    <IconButton label="Move up" icon={ArrowUp01Icon} onClick={() => move(key, -1)} disabled={layout.order.indexOf(key) === 0} />
                    <IconButton label="Move down" icon={ArrowDown01Icon} onClick={() => move(key, 1)} disabled={layout.order.indexOf(key) === layout.order.length - 1} />
                    <IconButton label={`Hide ${POPOUT_TITLE[key]}`} icon={Cancel01Icon} onClick={() => toggle(key)} />
                </>
            ) : (
                <IconButton label={`Pop out ${POPOUT_TITLE[key]}`} icon={LinkSquare02Icon} onClick={() => popOut(key)} />
            )}
        </div>
    );

    const panel = (key: PopoutPanelKey) => {
        if (key === "chat") {
            return userId ? <StreamChat key={key} hostUserId={userId} hasChatRoom={hasChatRoom} action={controls("chat")} /> : null;
        }
        if (key === "activity") return <ActivityFeed key={key} isLive={isLive} action={controls("activity")} />;
        return <ModActionsFeed key={key} isLive={isLive} action={controls("moderation")} />;
    };

    return (
        <div className="flex min-w-0 flex-col gap-4">
            <div className="flex items-center justify-between gap-2 px-1">
                <button
                    type="button"
                    onClick={() => setEditing((e) => !e)}
                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                    <HugeiconsIcon icon={Settings02Icon} className="size-3.5" />
                    {editing ? "Done" : "Edit layout"}
                </button>
                {editing && hydrated ? (
                    <button
                        type="button"
                        onClick={() => save(DEFAULT_LAYOUT)}
                        className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                    >
                        Reset
                    </button>
                ) : null}
            </div>

            {visible.map((key) => panel(key))}

            {/* Hidden panels stay reachable, which is what makes hiding safe.
                Only while editing — otherwise it is a row of buttons for
                something the creator deliberately put away. */}
            {editing && layout.hidden.length > 0 ? (
                <div className="rounded-2xl border border-dashed border-border/60 p-3">
                    <p className="mb-2 text-xs text-muted-foreground">Hidden</p>
                    <div className="flex flex-wrap gap-2">
                        {layout.hidden.map((key) => (
                            <button
                                key={key}
                                type="button"
                                onClick={() => toggle(key)}
                                className="rounded-full border border-border/60 px-2.5 py-1 text-xs transition-colors hover:bg-accent/40"
                            >
                                + {POPOUT_TITLE[key]}
                            </button>
                        ))}
                    </div>
                </div>
            ) : null}
        </div>
    );
}
