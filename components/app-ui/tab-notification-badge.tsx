"use client";

// Discord-style unread count in the browser tab: `(506) watchparty` in the
// title, plus a count badge painted onto the favicon. Renders nothing.
//
// Both halves update LIVE — the count comes from the same react-query cache the
// sidebar badge reads, so every existing invalidation (opening the panel,
// marking read, the realtime inbox hook) repaints the tab with no reload.
//
// Two things here are less obvious than they look:
//
//  - The title has to be re-applied on a MutationObserver, not just on count
//    change. Next rewrites <title> on every navigation from the route's own
//    metadata, which would silently drop our prefix the moment the user moves
//    between pages.
//  - The favicon is drawn on a canvas from the existing /icon.svg rather than
//    shipping pre-rendered badge images, because the count is unbounded.

import { useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";

/** Sidebar's notification red — `--color-notification`, resolved to sRGB. */
const NOTIFICATION_COLOR = "#ff3040";
const BADGE_INK = "#ffffff";

/** Strips a previously-applied `(12) ` prefix so it never compounds. */
function cleanTitle(title: string) {
    return title.replace(/^\(\d+\+?\)\s+/, "");
}

function badgeText(count: number) {
    return count > 999 ? "999+" : String(count);
}

/**
 * Paints the base icon at 64px and stamps a pill badge in the bottom-right.
 * Returns a data URL, or null if the icon can't be loaded (offline, blocked).
 */
async function drawFavicon(count: number, baseHref: string): Promise<string | null> {
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const img = new Image();
    // Same-origin asset, but an SVG still needs this to keep the canvas clean.
    img.crossOrigin = "anonymous";
    const loaded = await new Promise<boolean>((resolve) => {
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = baseHref;
    });
    if (!loaded) return null;

    ctx.drawImage(img, 0, 0, size, size);

    const text = badgeText(count);
    ctx.font = "bold 30px system-ui, -apple-system, sans-serif";
    const textWidth = ctx.measureText(text).width;

    const h = 34;
    const w = Math.max(h, textWidth + 16);
    const x = size - w;
    const y = size - h;
    const r = h / 2;

    // Punch a transparent gutter first so the badge reads as a separate chip
    // sitting on top of the mark rather than blending into it.
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.roundRect(x - 3, y - 3, w + 6, h + 6, r + 3);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = NOTIFICATION_COLOR;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();

    ctx.fillStyle = BADGE_INK;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // +1px optical centering: the cap-height box sits high in the em box.
    ctx.fillText(text, x + w / 2, y + h / 2 + 1);

    return canvas.toDataURL("image/png");
}

export function TabNotificationBadge() {
    const { data: session } = useAuthSession();
    const signedIn = !!session?.user;

    // Notifications have NO push channel — nothing invalidates this except
    // interacting with the panel — so the poll is the only thing that keeps the
    // tab live. Cheap COUNT, and the tab is the one surface visible while the
    // user is doing something else.
    const { data: notifs } = trpc.notification.getUnreadCount.useQuery(undefined, {
        enabled: signedIn,
        refetchInterval: 60_000,
        refetchOnWindowFocus: true,
    });

    // Unread DMs, merged in the way Discord's badge does.
    //
    // 300_000 is copied from the sidebar's observer ON PURPOSE, not tuned for
    // this component: react-query runs a shared key at the MOST AGGRESSIVE
    // interval any observer asks for, so a tighter value here would silently
    // undo the widening the sidebar did deliberately for container load (it
    // notes 30s was the widest poll in the app, every page, every user).
    // Liveness doesn't depend on it anyway — useInboxRealtime push-invalidates
    // this key on every inbox event.
    const { data: dms } = trpc.conversation.getUnreadCount.useQuery(undefined, {
        enabled: signedIn,
        refetchInterval: 300_000,
        refetchOnWindowFocus: true,
    });

    const count = signedIn ? (notifs?.count ?? 0) + (dms?.count ?? 0) : 0;

    // The href of the icon link as it was before we touched it, so signing out
    // or clearing the count restores the real favicon rather than a stale PNG.
    const originalIcon = useRef<string | null>(null);
    // Set by us; lets the MutationObserver ignore its own writes.
    const applied = useRef<string | null>(null);

    // ── Title ────────────────────────────────────────────────────────────────
    useEffect(() => {
        if (typeof document === "undefined") return;

        const apply = () => {
            const base = cleanTitle(document.title);
            const next = count > 0 ? `(${badgeText(count)}) ${base}` : base;
            if (document.title !== next) {
                applied.current = next;
                document.title = next;
            }
        };

        apply();

        const titleEl = document.querySelector("title");
        if (!titleEl) return;

        // Next replaces the title's text on navigation; re-apply the prefix
        // unless the change was ours.
        const observer = new MutationObserver(() => {
            if (document.title === applied.current) return;
            apply();
        });
        observer.observe(titleEl, { childList: true, characterData: true, subtree: true });

        return () => observer.disconnect();
    }, [count]);

    // ── Favicon ──────────────────────────────────────────────────────────────
    useEffect(() => {
        if (typeof document === "undefined") return;
        let cancelled = false;

        const link =
            document.querySelector<HTMLLinkElement>("link[rel~='icon']") ??
            (() => {
                const el = document.createElement("link");
                el.rel = "icon";
                document.head.appendChild(el);
                return el;
            })();

        if (originalIcon.current === null) originalIcon.current = link.getAttribute("href") ?? "/icon.svg";
        const base = originalIcon.current;

        if (count <= 0) {
            link.href = base;
            return;
        }

        void drawFavicon(count, base).then((url) => {
            if (cancelled || !url) return;
            link.href = url;
        });

        return () => {
            cancelled = true;
        };
    }, [count]);

    // Restore both on unmount (sign-out, or leaving the authenticated shell).
    useEffect(() => {
        return () => {
            document.title = cleanTitle(document.title);
            const link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
            if (link && originalIcon.current) link.href = originalIcon.current;
        };
    }, []);

    return null;
}
