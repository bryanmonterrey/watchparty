"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

// The particle burst behind the like button's celebration (transitions.dev
// 23-like-button), lifted out of home-video-header so anything else can fire
// the same one. The CSS lives in globals.css under `.t-like*`; this owns only
// the React half — the per-particle vectors and the replay timing.
//
// Colour is NOT decided here. `.t-like-particles` reads `--like-color`, so a
// caller recolours the whole effect by setting that variable on the button
// (the trending star sets it to the app blue; the like button inherits the
// pastel red from :root).

const PARTICLE_COUNT = 8;

/** One dot's flight vector, duration, delay and end scale. */
export function makeParticles(): CSSProperties[] {
    return Array.from({ length: PARTICLE_COUNT }, (_, i) => {
        // Even angular spread, jittered so it never looks mechanical.
        const angle = (i / PARTICLE_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.7;
        const dist = 14 + Math.random() * 12;
        return {
            "--px": `${Math.cos(angle) * dist}px`,
            "--py": `${Math.sin(angle) * dist}px`,
            "--pdur": `${480 + Math.round(Math.random() * 240)}ms`,
            "--pdelay": `${Math.round(Math.random() * 60)}ms`,
            "--p-end-scale": `${0.4 + Math.random() * 0.4}`,
            "--psize": `${0.7 + Math.random() * 0.8}`,
        } as CSSProperties;
    });
}

/**
 * Drives one celebration burst.
 *
 * `bursting` toggles the `.is-bursting` class, `particles` are the dots to
 * render inside `.t-like-particles`, and `fire()` replays it.
 */
export function useBurst() {
    const [bursting, setBursting] = useState(false);
    const [particles, setParticles] = useState<CSSProperties[]>(() => makeParticles());
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // A rapid re-fire would otherwise leave a stale timer to clear
    // .is-bursting mid-animation, and an unmount mid-burst would set state on
    // a dead node.
    useEffect(() => () => {
        if (timer.current) clearTimeout(timer.current);
    }, []);

    const fire = useCallback(() => {
        if (timer.current) clearTimeout(timer.current);
        setParticles(makeParticles());
        setBursting(false);
        // Reflow between removing and re-adding the class is what makes the
        // burst replay on a second press instead of sitting at its end state.
        requestAnimationFrame(() => {
            setBursting(true);
            timer.current = setTimeout(() => setBursting(false), 900);
        });
    }, []);

    return { bursting, particles, fire };
}
