"use client";

import { useCallback, useEffect, useRef } from "react";
import { useAudioOwner } from "@/lib/audio-bus";

/**
 * Autoplay and the page-wide audio bus — one hook, because they are one
 * negotiation: a browser only grants autoplay to a SILENT element, so the
 * player starts muted and the bus is what asks for the sound back a moment
 * later. Split across two files they read as unrelated, and the ordering
 * between them (which is load-bearing) stops being visible.
 *
 * Both halves are opt-in and inert by default, so the watch page behaves
 * exactly as it did: nothing autoplays, nothing claims the page's audio.
 *
 * The bus itself (`lib/audio-bus`) is "only one video is audible at a time":
 * whoever claimed last wins and everything else mutes. The home hero opts in
 * because the cards around it preview audio on hover.
 */
export function useAudioBus({
    enabled,
    autoPlay,
    videoRef,
    videoUrl,
    isPlaying,
    setIsMuted,
}: {
    /** Join the bus. Off, every effect here returns early. */
    enabled: boolean;
    /** Start playing on mount (muted first — see above). */
    autoPlay: boolean;
    videoRef: React.RefObject<HTMLVideoElement | null>;
    videoUrl?: string | null;
    isPlaying: boolean;
    setIsMuted: (muted: boolean) => void;
}) {
    const { isOwner, hasOwner, claim, release } = useAudioOwner();
    // What the USER asked for, deliberately kept apart from the muting the bus
    // does on its own: without the split, losing audio to a hovered card would
    // read as "the user muted this" and the hero would never speak again once
    // the card let go.
    const userMutedRef = useRef(false);
    // What the bus last left the element at, so an un-mute it performed itself
    // can be told apart from one the user asked for.
    const busMutedRef = useRef(true);

    // ── Autoplay ──────────────────────────────────────────────────────────────
    // Declared FIRST on purpose: mount effects run in order, so the element is
    // already playing by the time anything below unmutes it.
    //
    // Retried once on `canplay` because on a cold load the first call happens
    // before there is anything to play. The `paused` guard is what keeps that
    // retry from re-muting a player the bus has already handed the audio to.
    useEffect(() => {
        if (!autoPlay) return;
        const video = videoRef.current;
        if (!video || !videoUrl) return;
        const start = () => {
            if (!video.paused) return;
            video.muted = true;
            void video.play().catch(() => { });
        };
        start();
        video.addEventListener("canplay", start, { once: true });
        return () => video.removeEventListener("canplay", start);
    }, [autoPlay, videoRef, videoUrl]);

    // ── Ownership ─────────────────────────────────────────────────────────────
    // Claim on mount, let go on unmount.
    useEffect(() => {
        if (!enabled) return;
        claim();
        return () => release();
    }, [enabled, claim, release]);

    // Take it back once nobody holds it — a hovered card finished its preview —
    // unless the user is the one who silenced this player.
    useEffect(() => {
        if (!enabled || hasOwner || userMutedRef.current) return;
        claim();
    }, [enabled, hasOwner, claim]);

    // Apply ownership to the element. `isPlaying` is in the deps because
    // autoplay's muted retry can land after this last ran, and the sound is owed
    // to the player the moment it is actually playing.
    useEffect(() => {
        if (!enabled) return;
        const video = videoRef.current;
        if (!video) return;
        const muted = userMutedRef.current || !isOwner;
        // Only a bus-driven un-mute arms the guard below — one the user asked
        // for came with a gesture, which is exactly what makes it safe.
        const busUnmuting = busMutedRef.current && !muted;
        busMutedRef.current = muted;
        video.muted = muted;
        setIsMuted(muted || video.volume === 0);
        if (!busUnmuting || video.paused) return;

        // Safari PAUSES a video that autoplayed muted the instant it is un-muted
        // without a user gesture (WebKit's autoplay policy) — the hero would stop
        // dead on its first frame. Silent and playing beats loud and stopped, so
        // take the mute back and carry on. Armed for a moment only, so a real
        // pause click a second later still pauses.
        const onPause = () => {
            video.muted = true;
            setIsMuted(true);
            void video.play().catch(() => { });
        };
        video.addEventListener("pause", onPause, { once: true });
        const timer = setTimeout(() => video.removeEventListener("pause", onPause), 300);
        return () => {
            clearTimeout(timer);
            video.removeEventListener("pause", onPause);
        };
    }, [enabled, isOwner, isPlaying, videoRef, setIsMuted]);

    /**
     * Tell the bus what the user did to the mute state. Un-muting IS a claim —
     * asking for sound is asking for the page's audio.
     */
    const noteUserMuted = useCallback((muted: boolean) => {
        userMutedRef.current = muted;
        if (enabled && !muted) claim();
    }, [enabled, claim]);

    return { noteUserMuted };
}
