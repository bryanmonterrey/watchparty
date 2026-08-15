"use client";

// Discord-style unread badge painted onto the FAVICON. Renders nothing.
//
// The title is deliberately left alone. An earlier version prefixed it with
// `(12) `, which is what Discord does too, but the ask here was the red badge
// specifically — and the prefix also had to fight Next, which rewrites <title>
// from each route's metadata on navigation.
//
// The count is notifications + unread DMs, read from the same react-query cache
// the sidebar badges use, so every existing invalidation repaints the tab with
// no reload.

import { useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { drawFaviconBadge } from "@/lib/tab-badge/draw";

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

    // The favicon links as they were before we touched them, so clearing the
    // count (or signing out) puts the real icon back.
    const original = useRef<{ rel: string; href: string; type: string }[] | null>(null);

    useEffect(() => {
        if (typeof document === "undefined") return;
        let cancelled = false;

        const iconLinks = () =>
            [...document.querySelectorAll<HTMLLinkElement>("link[rel~='icon'], link[rel='shortcut icon']")];

        if (original.current === null) {
            original.current = iconLinks()
                .filter((l) => !l.dataset.tabBadge)
                .map((l) => ({ rel: l.getAttribute("rel") ?? "icon", href: l.href, type: l.getAttribute("type") ?? "" }));
        }

        // Replacing the ELEMENT is load-bearing. Chrome frequently ignores an
        // href mutation on an existing favicon link — the tab keeps the icon it
        // already resolved — so the only reliable update is to remove every
        // icon link and append a fresh one.
        const swapIn = (href: string, type: string) => {
            for (const l of iconLinks()) l.remove();
            const link = document.createElement("link");
            link.rel = "icon";
            if (type) link.type = type;
            link.dataset.tabBadge = "1";
            link.href = href;
            document.head.appendChild(link);
        };

        const restore = () => {
            for (const l of iconLinks()) l.remove();
            for (const o of original.current ?? []) {
                const link = document.createElement("link");
                link.setAttribute("rel", o.rel);
                if (o.type) link.type = o.type;
                link.href = o.href;
                document.head.appendChild(link);
            }
        };

        if (count <= 0) {
            restore();
            return;
        }

        void drawFaviconBadge(count).then((url) => {
            if (cancelled || !url) return;
            swapIn(url, "image/png");
        });

        return () => {
            cancelled = true;
        };
    }, [count]);

    // Put the real icon back if this unmounts (sign-out, leaving the shell).
    useEffect(() => {
        return () => {
            for (const l of document.querySelectorAll("link[data-tab-badge]")) l.remove();
            for (const o of original.current ?? []) {
                const link = document.createElement("link");
                link.setAttribute("rel", o.rel);
                if (o.type) link.type = o.type;
                link.href = o.href;
                document.head.appendChild(link);
            }
        };
    }, []);

    return null;
}
