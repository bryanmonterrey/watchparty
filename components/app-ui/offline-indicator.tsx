"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import { WifiOff01Icon } from "@hugeicons/core-free-icons";

// Sticky "you're offline" toast: appears when the browser loses connectivity,
// dismisses itself on reconnect. Listener-only (renders nothing).
export function OfflineIndicator() {
    const toastId = useRef<string | number | undefined>(undefined);

    useEffect(() => {
        const show = () => {
            toastId.current = toast.error("You're offline — reconnecting…", {
                duration: Infinity,
                icon: <HugeiconsIcon icon={WifiOff01Icon} className="size-4" />,
            });
        };
        const hide = () => {
            if (toastId.current === undefined) return;
            toast.dismiss(toastId.current);
            toastId.current = undefined;
        };

        if (!navigator.onLine) show();
        window.addEventListener("offline", show);
        window.addEventListener("online", hide);
        return () => {
            window.removeEventListener("offline", show);
            window.removeEventListener("online", hide);
        };
    }, []);

    return null;
}
