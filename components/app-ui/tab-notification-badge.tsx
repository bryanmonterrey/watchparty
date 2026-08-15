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

import { useEffect } from "react";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { drawFaviconBadge } from "@/lib/tab-badge/draw";

/** The site's own favicon links — everything except the one this file appends. */
const SITE_ICONS = "link[rel~='icon'], link[rel='shortcut icon']";

/** A rel no browser resolves, so the link is inert without leaving the DOM. */
const INACTIVE_REL = "wp-inactive-icon";

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

    useEffect(() => {
        if (typeof document === "undefined") return;
        let cancelled = false;

        // NEVER `.remove()` a site icon link. Those <link rel="icon"> elements
        // come from Next's metadata, so REACT OWNS THEM — taking them out of
        // the DOM behind its back leaves fibers pointing at parentless nodes,
        // and the next commit that deletes one throws
        // `Cannot read properties of null (reading 'removeChild')` inside
        // React's deletion phase. That kills the commit, which means the
        // NAVIGATION never renders: the URL changes, <title> blanks, and the
        // old page stays on screen until a second click bails Next out to a
        // full document load. That was the "every link needs two clicks" bug
        // (measured on production 2026-08-15: ~19 removeChild throws per page,
        // and blocking just this removal made one-click navigation work).
        //
        // Deactivating by REL is the safe equivalent. Chrome stops treating
        // the link as an icon, React's memoized props still say `rel="icon"`
        // so it never diffs the attribute back, and the node stays in the DOM
        // where React can still delete it normally.
        const deactivateSiteIcons = () => {
            for (const l of document.querySelectorAll<HTMLLinkElement>(SITE_ICONS)) {
                if (l.dataset.tabBadge) continue;
                l.dataset.tabBadgeRel = l.getAttribute("rel") ?? "icon";
                l.setAttribute("rel", INACTIVE_REL);
            }
        };

        const reactivateSiteIcons = () => {
            for (const l of document.querySelectorAll<HTMLLinkElement>(`link[rel="${INACTIVE_REL}"]`)) {
                const rel = l.dataset.tabBadgeRel;
                if (!rel) continue;
                delete l.dataset.tabBadgeRel;
                l.setAttribute("rel", rel);
            }
        };

        // Ours, and only ours — this one React has never heard of, so removing
        // it is safe.
        const dropBadgeLink = () => {
            for (const l of document.querySelectorAll("link[data-tab-badge]")) l.remove();
        };

        if (count <= 0) {
            dropBadgeLink();
            reactivateSiteIcons();
            return;
        }

        // Replacing the ELEMENT is still load-bearing for OUR link: Chrome
        // frequently ignores an href mutation on a favicon link it has already
        // resolved, so each repaint appends a fresh one.
        const swapIn = (href: string) => {
            deactivateSiteIcons();
            dropBadgeLink();
            const link = document.createElement("link");
            link.rel = "icon";
            link.type = "image/png";
            link.dataset.tabBadge = "1";
            link.href = href;
            document.head.appendChild(link);
        };

        // Next re-renders the metadata on every navigation, so React can mount
        // a FRESH `rel="icon"` link at any time — which would outrank the badge
        // for the rest of the session. Watching <head> re-deactivates those.
        // No feedback loop: our own link carries data-tab-badge and is skipped,
        // and a deactivated link no longer matches SITE_ICONS.
        const observer = new MutationObserver(deactivateSiteIcons);
        observer.observe(document.head, { childList: true });

        void drawFaviconBadge(count).then((url) => {
            if (cancelled || !url) return;
            swapIn(url);
        });

        return () => {
            cancelled = true;
            observer.disconnect();
        };
    }, [count]);

    // Put the real icon back if this unmounts (sign-out, leaving the shell).
    useEffect(() => {
        return () => {
            for (const l of document.querySelectorAll("link[data-tab-badge]")) l.remove();
            for (const l of document.querySelectorAll<HTMLLinkElement>(`link[rel="${INACTIVE_REL}"]`)) {
                const rel = l.dataset.tabBadgeRel;
                if (!rel) continue;
                delete l.dataset.tabBadgeRel;
                l.setAttribute("rel", rel);
            }
        };
    }, []);

    return null;
}
