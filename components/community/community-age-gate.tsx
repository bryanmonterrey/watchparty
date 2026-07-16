"use client";

import { useSyncExternalStore, useCallback } from "react";
import { useRouter } from "next/navigation";

const CONFIRM_EVENT = "community:age-confirmed";

function subscribe(cb: () => void) {
    window.addEventListener(CONFIRM_EVENT, cb);
    return () => window.removeEventListener(CONFIRM_EVENT, cb);
}

// Age-restricted servers (Access → Age-restricted): an opaque confirm covers
// the server until the visitor confirms, remembered per server on this device.
// useSyncExternalStore reads localStorage without an effect; the server
// snapshot says "confirmed" so SSR renders nothing and hydration matches.
export function CommunityAgeGate({ serverId, serverName }: { serverId: string; serverName: string }) {
    const router = useRouter();
    const key = `community:age-ok:${serverId}`;

    const confirmed = useSyncExternalStore(
        subscribe,
        () => localStorage.getItem(key) === "1",
        () => true,
    );

    const confirm = useCallback(() => {
        localStorage.setItem(key, "1");
        window.dispatchEvent(new Event(CONFIRM_EVENT));
    }, [key]);

    if (confirmed) return null;

    return (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-1 bg-background px-6 text-center">
            <p className="text-[13px] font-bold tracking-wide text-pastelred">18+</p>
            <h2 className="text-xl font-bold tracking-tight text-white">{serverName} is age-restricted</h2>
            <p className="max-w-sm text-[14px] font-medium leading-relaxed text-zinc-500">
                Confirm you&apos;re over the legal age in your country to view this server.
            </p>
            <div className="mt-5 flex items-center gap-2">
                <button
                    onClick={() => router.push("/communities")}
                    className="h-11 cursor-pointer rounded-full bg-white/10 px-6 text-[14px] font-bold text-white transition-colors hover:bg-white/20"
                >
                    Take me back
                </button>
                <button
                    onClick={confirm}
                    className="h-11 cursor-pointer rounded-full bg-white px-6 text-[14px] font-bold text-black transition-colors hover:bg-white/90"
                >
                    I&apos;m over 18
                </button>
            </div>
        </div>
    );
}
