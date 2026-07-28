"use client";

import { useEffect } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, Loading03Icon } from "@hugeicons/core-free-icons";
import { setDebugFlag, useDebugFlag } from "@/lib/debug-loading";

// Floating switch that holds the app in its loading state so skeletons can be
// looked at (and screenshotted) instead of flashing past.
//
// Reveal it with `?debug-loading` on any (app) route — e.g. /home?debug-loading.
// Once revealed it sticks for the tab (sessionStorage), so you can navigate
// around with it; × hides it, and closing the tab resets everything.
//
// Bottom-LEFT on purpose: the top-right belongs to the header's wallet/create
// cluster, and this thing exists to look at that cluster.
export function LoadingDebug() {
    const visible = useDebugFlag("panel");
    const forced = useDebugFlag("loading");

    useEffect(() => {
        // Read location directly rather than useSearchParams() — no Suspense
        // boundary needed, and no dynamic-rendering bailout for the layout.
        if (new URLSearchParams(window.location.search).has("debug-loading")) {
            setDebugFlag("panel", true);
        }
    }, []);

    if (!visible) return null;

    return (
        <div className="fixed bottom-4 left-4 z-100 flex items-center gap-1 rounded-full border border-baseborder/20 bg-soft-gray-10 p-1 backdrop-blur-xs max-md:hidden">
            <button
                type="button"
                onClick={() => setDebugFlag("loading", !forced)}
                aria-pressed={forced}
                className="flex h-9 items-center gap-2 rounded-full px-3 text-sm font-medium text-white/80 transition-colors ease-out hover:bg-soft-gray-15 hover:text-white"
            >
                <HugeiconsIcon
                    icon={Loading03Icon}
                    className={`size-4 shrink-0 ${forced ? "animate-spin text-hotpink" : "text-white/50"}`}
                    strokeWidth={2}
                />
                <span>loading states {forced ? "on" : "off"}</span>
            </button>
            <button
                type="button"
                onClick={() => {
                    setDebugFlag("loading", false);
                    setDebugFlag("panel", false);
                }}
                aria-label="hide debug toggle"
                className="flex size-9 items-center justify-center rounded-full text-white/50 transition-colors ease-out hover:bg-soft-gray-15 hover:text-white"
            >
                <HugeiconsIcon icon={Cancel01Icon} className="size-4" strokeWidth={2} />
            </button>
        </div>
    );
}
