"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";

// Page-wide "only one video is audible at a time" coordinator. Whichever video
// most recently claimed audio becomes the owner; every other player mutes
// itself. Wired into the home hero (home-carousel) and the trending card
// previews (desktop-home) so hovering/unmuting a card never doubles up audio
// with the hero — and the hero reclaims sound once the card lets go.
let owner: object | null = null;
const listeners = new Set<() => void>();

function emit() {
    listeners.forEach((l) => l());
}

export function claimAudio(token: object) {
    if (owner === token) return;
    owner = token;
    emit();
}

export function releaseAudio(token: object) {
    if (owner !== token) return;
    owner = null;
    emit();
}

function subscribe(l: () => void) {
    listeners.add(l);
    return () => {
        listeners.delete(l);
    };
}

function getOwner() {
    return owner;
}

// Stable per-component identity + reactive ownership. `isOwner` is true when
// this component holds audio; `hasOwner` distinguishes "free" from "someone
// else owns it" (the hero uses it to reclaim once a card releases).
export function useAudioOwner() {
    const tokenRef = useRef<object>({});
    const current = useSyncExternalStore(subscribe, getOwner, () => null);
    const claim = useCallback(() => claimAudio(tokenRef.current), []);
    const release = useCallback(() => releaseAudio(tokenRef.current), []);
    return {
        isOwner: current === tokenRef.current,
        hasOwner: current !== null,
        claim,
        release,
    };
}
