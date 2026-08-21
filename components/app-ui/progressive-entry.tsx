"use client";

import { startTransition, useEffect, useState, type ReactNode } from "react";

/**
 * PROGRESSIVE ENTRY — the /home nav-stall fix, generalized (2026-08-20).
 *
 * A route's loading.tsx only paints while the RSC payload is pending; for
 * mostly-static pages that resolves in instants, and the CLIENT mount then
 * renders the whole surface in one commit — on /home that commit profiled at
 * ~1s (squircle layout thrash under a warm snapshot placeholder), with the
 * OLD page frozen and no loader ever shown.
 *
 * So the mounted page's FIRST commit renders the same shell its loading.tsx
 * serves — cheap, pixel-identical, so the route shell hands over invisibly —
 * and the real surface enters in a transition immediately after. The heavy
 * commit still happens, but behind a painted loading frame instead of a
 * frozen previous page. Skeletons are motionless flat fills by design, so a
 * shell sitting through a blocked main thread is indistinguishable from a
 * live one.
 *
 * Usage (from a server page, keeping children as RSC works fine):
 *   <ProgressiveEntry shell={<RouteLoading />}><HeavySurface /></ProgressiveEntry>
 *
 * The shell MUST mirror the mounted page's own first frame — see
 * app/(app)/(rails)/home/loading.tsx for the standard.
 */
export function ProgressiveEntry({ shell, children }: { shell: ReactNode; children: ReactNode }) {
    const [entered, setEntered] = useState(false);
    useEffect(() => {
        startTransition(() => setEntered(true));
    }, []);
    return <>{entered ? children : shell}</>;
}
