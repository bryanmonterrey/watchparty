"use client";

import { useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc/client";
import { REFERRAL_STORAGE_KEY } from "@/components/auth/referral-capture";

// Redeems a referral stashed by ReferralCapture on the login page. Runs once
// per app boot; the key is cleared on ANY terminal outcome (applied, already
// referred, invalid) so it can't retry-spam. Renders nothing.
export function ReferralApply() {
    const applyCode = trpc.referral.applyCode.useMutation();
    const fired = useRef(false);

    useEffect(() => {
        if (fired.current) return;
        fired.current = true;
        let pending: string | null = null;
        try {
            pending = localStorage.getItem(REFERRAL_STORAGE_KEY);
        } catch {
            return;
        }
        if (!pending) return;

        applyCode.mutate(
            { code: pending },
            {
                onSettled: () => {
                    try {
                        localStorage.removeItem(REFERRAL_STORAGE_KEY);
                    } catch {
                        // ignore
                    }
                },
            },
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return null;
}
