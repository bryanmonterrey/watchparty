"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// The rail's sound toggle (the speaker in the reference's header).
//
// Synthesised with WebAudio rather than shipped as an asset: it's a two-note
// blip, so a file would be a network request and a cache entry for ~200 bytes
// of sine wave. It also means the pitch can carry the side — buys chirp up,
// sells drop down — which an mp3 would need two of.

const STORAGE_KEY = "wp:coin-alerts:sound";

let ctx: AudioContext | null = null;

function audioContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return null;
        ctx = new Ctor();
    }
    return ctx;
}

function blip(tone: "up" | "down") {
    const ac = audioContext();
    if (!ac) return;
    // Autoplay policy suspends the context until a gesture; the toggle itself
    // is that gesture, so by the time this fires it's resumable.
    if (ac.state === "suspended") void ac.resume().catch(() => {});

    const now = ac.currentTime;
    const osc = ac.createOscillator();
    const gain = ac.createGain();

    osc.type = "sine";
    const [from, to] = tone === "up" ? [660, 990] : [560, 380];
    osc.frequency.setValueAtTime(from, now);
    osc.frequency.exponentialRampToValueAtTime(to, now + 0.09);

    // Quiet, and fully ramped: a hard start/stop on a sine clicks.
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.05, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

    osc.connect(gain).connect(ac.destination);
    osc.start(now);
    osc.stop(now + 0.18);
}

export function useAlertSound() {
    const [enabled, setEnabled] = useState(false);
    // Mirror into a ref so the realtime handler can read the current value
    // without being torn down and resubscribed every time it flips.
    const enabledRef = useRef(false);
    const lastPlayedAt = useRef(0);

    // Read the stored preference after mount, never during render — this
    // component is inside the app shell, which server-renders.
    useEffect(() => {
        try {
            const on = window.localStorage.getItem(STORAGE_KEY) === "1";
            enabledRef.current = on;
            setEnabled(on);
        } catch {
            // private mode / storage disabled — default off is fine
        }
    }, []);

    const toggle = useCallback(() => {
        setEnabled((prev) => {
            const next = !prev;
            enabledRef.current = next;
            try {
                window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
            } catch { /* not worth failing the toggle over */ }
            // Confirm the switch audibly, and (importantly) create/resume the
            // AudioContext inside the user gesture that enabled it.
            if (next) blip("up");
            return next;
        });
    }, []);

    /** Play the alert tone if sound is on. Rate-limited: a burst of realtime
     *  inserts must not turn into a machine-gun. */
    const play = useCallback((tone: "up" | "down") => {
        if (!enabledRef.current) return;
        const now = Date.now();
        if (now - lastPlayedAt.current < 1200) return;
        lastPlayedAt.current = now;
        blip(tone);
    }, []);

    return { enabled, toggle, play };
}
