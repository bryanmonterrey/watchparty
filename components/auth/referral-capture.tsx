"use client";

import { useEffect } from "react";

export const REFERRAL_STORAGE_KEY = "wp:pending-referral";

// Stashes ?ref=<username|code> from the login URL so it survives the OAuth /
// OTP round trip; ReferralApply (inside the app) redeems it after signup.
// Deliberately tiny — the login route stays light.
export function ReferralCapture({ refCode }: { refCode?: string }) {
    useEffect(() => {
        if (!refCode) return;
        try {
            localStorage.setItem(REFERRAL_STORAGE_KEY, refCode.slice(0, 40));
        } catch {
            // storage blocked (private mode) — referral just doesn't attach
        }
    }, [refCode]);
    return null;
}
