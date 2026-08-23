"use client";

import * as React from "react";
import Image from "next/image";

import type { HomeCategory } from "@/lib/data/home-categories";

// The category field, as a typeahead over the real catalog (studio S6: "a
// category picker — typeahead, not free text"). What a viewer browses by is
// the category INDEX, so a stream typed as "just chatting " or "Just chating"
// lands in no category at all; picking from the catalog is what makes the
// stream findable.
//
// THE CATALOG IS LAZY, and that is the point. kick_categories.json is 142KB
// and every other reader of ALL_CATEGORIES is a server component, so a plain
// top-level import here would put 142KB of JSON into the studio's client
// bundle to serve one input nobody touches on most visits. It loads on first
// focus instead — the house rule for anything heavy (see CLAUDE.md's speed
// rule), and by the time a creator has typed a character it is there.
//
// Free text still saves: `stream.updateInfo` takes any string ≤50, creators
// stream things the catalog has never heard of, and a picker that REFUSED the
// unknown would be worse than the input it replaced.

export function CategoryPicker({
    value,
    onChange,
    disabled,
}: {
    value: string;
    onChange: (next: string) => void;
    disabled?: boolean;
}) {
    const [open, setOpen] = React.useState(false);
    const [catalog, setCatalog] = React.useState<HomeCategory[] | null>(null);
    const [loading, setLoading] = React.useState(false);
    const boxRef = React.useRef<HTMLDivElement | null>(null);

    const load = React.useCallback(async () => {
        if (catalog || loading) return;
        setLoading(true);
        try {
            const mod = await import("@/lib/data/all-categories");
            setCatalog(mod.ALL_CATEGORIES);
        } finally {
            setLoading(false);
        }
    }, [catalog, loading]);

    /* Pointerdown, not blur: blur fires before the click lands on a row, so
       closing there means the first pick never registers. */
    React.useEffect(() => {
        if (!open) return;
        const onDown = (e: PointerEvent) => {
            if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("pointerdown", onDown);
        return () => document.removeEventListener("pointerdown", onDown);
    }, [open]);

    /* Prefix matches first — typing "mu" wants Music, not "Album Music". */
    const matches = React.useMemo(() => {
        if (!catalog) return [];
        const q = value.trim().toLowerCase();
        if (!q) return catalog.slice(0, 8);
        const starts: HomeCategory[] = [];
        const contains: HomeCategory[] = [];
        for (const c of catalog) {
            const title = c.title.toLowerCase();
            if (title.startsWith(q)) starts.push(c);
            else if (title.includes(q)) contains.push(c);
            if (starts.length >= 8) break;
        }
        return [...starts, ...contains].slice(0, 8);
    }, [catalog, value]);

    const exact = catalog?.some((c) => c.title.toLowerCase() === value.trim().toLowerCase()) ?? false;

    return (
        <div ref={boxRef} className="relative">
            <input
                value={value}
                maxLength={50}
                disabled={disabled}
                onFocus={() => {
                    void load();
                    setOpen(true);
                }}
                onChange={(e) => {
                    onChange(e.target.value);
                    setOpen(true);
                }}
                onKeyDown={(e) => {
                    if (e.key === "Escape") setOpen(false);
                }}
                placeholder="e.g. Just Chatting, Trading, Music"
                role="combobox"
                aria-expanded={open}
                aria-autocomplete="list"
                className="h-11 w-full rounded-xl border border-border/60 bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />

            {/* Says whether this stream will actually appear under a category,
                which is the only reason the picker exists. */}
            {value.trim() && catalog ? (
                <p className="mt-1 text-[11px] text-muted-foreground">
                    {exact ? "Listed in this category." : "Custom — viewers won't find this under a category."}
                </p>
            ) : null}

            {open ? (
                <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-border/60 bg-popover shadow-lg">
                    {loading || !catalog ? (
                        <p className="px-3 py-2.5 text-xs text-muted-foreground">Loading categories…</p>
                    ) : matches.length === 0 ? (
                        <p className="px-3 py-2.5 text-xs text-muted-foreground">
                            No match — this saves as a custom category.
                        </p>
                    ) : (
                        <ul role="listbox" className="max-h-64 overflow-y-auto">
                            {matches.map((c) => (
                                <li key={c.slug}>
                                    <button
                                        type="button"
                                        role="option"
                                        aria-selected={c.title.toLowerCase() === value.trim().toLowerCase()}
                                        onClick={() => {
                                            onChange(c.title);
                                            setOpen(false);
                                        }}
                                        className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-accent/40"
                                    >
                                        {c.thumbnailUrl ? (
                                            <Image
                                                src={c.thumbnailUrl}
                                                alt=""
                                                width={28}
                                                height={38}
                                                className="h-9 w-7 shrink-0 rounded object-cover"
                                            />
                                        ) : (
                                            <span className="h-9 w-7 shrink-0 rounded bg-muted/40" />
                                        )}
                                        <span className="min-w-0 flex-1 truncate text-sm">{c.title}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            ) : null}
        </div>
    );
}
