"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOutAndClearSnapshots } from "@/lib/auth/client";
import { PinkStarLogo } from "@/components/icons";
import { Squircle } from "@/components/ui/squircle";

/**
 * Mobile gate for the authenticated app: below `md` this covers every (app)
 * route with a login-screen-styled "desktop only" notice. Rendered as a fixed
 * opaque overlay (not display:none on the shell) so Radix dialogs that portal
 * to <body> — e.g. onboarding — stay underneath it too. Delete the render in
 * app/(app)/layout.tsx once the responsive pass lands.
 */
export function DesktopOnlyGate() {
    const router = useRouter();
    const [busy, setBusy] = useState(false);

    return (
        <div className="fixed inset-0 z-[200] flex flex-col items-center bg-background px-6 md:hidden">
            {/* Logo — same top tile as the login card */}
            <div className="mx-auto grid place-items-center pt-14">
                <PinkStarLogo className="size-7" />
            </div>

            <div className="flex w-full max-w-[442px] flex-1 flex-col items-center justify-center pb-16 text-center">
                <Squircle asChild radius={28} autoEffects={false}>
                    <div className="grid size-[92px] place-items-center bg-[#6A6A6A]/35">
                        <MonitorIcon className="size-11 text-white/85" />
                    </div>
                </Squircle>

                <h1 className="mt-7 text-2xl font-semibold tracking-tight">Desktop only</h1>

                <p className="mt-3 max-w-[300px] text-[15px] leading-relaxed text-zinc-500">
                    watchparty isn&apos;t ready for small screens yet. Open{" "}
                    <span className="font-medium text-zinc-300">watchparty.xyz</span> on your
                    computer to keep watching.
                </p>

                <button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                        setBusy(true);
                        await signOutAndClearSnapshots();
                        router.push("/login");
                        router.refresh();
                    }}
                    className="mt-8 text-center text-[15px] font-semibold tracking-tight text-[#1D9BF0] transition-opacity hover:opacity-80 disabled:opacity-50"
                >
                    {busy ? "Signing out…" : "Sign out"}
                </button>
            </div>

            {/* Wordmark — same bottom lockup as the login card */}
            <div className="mt-auto py-9 text-lg font-bold tracking-tight">watchparty</div>
        </div>
    );
}

// Stroke style matches the login card's inline icons (1.8px, round caps).
function MonitorIcon({ className }: { className?: string }) {
    return (
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
            <rect x="2.5" y="4" width="19" height="13" rx="3" stroke="currentColor" strokeWidth="1.8" />
            <path d="M9 20.5h6M12 17.5v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
    );
}
