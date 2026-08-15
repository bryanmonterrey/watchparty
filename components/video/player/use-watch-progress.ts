"use client";

import { useCallback, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { store } from "./types";

/**
 * How close to the end counts as FINISHED rather than in-progress. A position
 * inside this window is neither saved nor resumed, and the two halves of that
 * rule are what keep a queue surface from ending, advancing, ending, advancing:
 * resuming into the tail fires `ended` within a second, and on the home hero
 * `ended` means "next video".
 */
const RESUME_TAIL_SECONDS = 10;

/**
 * Everything the player records about a viewing, and the one thing it reads
 * back: the view count, the saved position, and the resume that position exists
 * for. Signed-in state goes to the DB; signed-out falls back to localStorage.
 */
export function useWatchProgress({
    postId,
    videoRef,
    isPlaying,
    setCurrentTime,
}: {
    postId: string;
    videoRef: React.RefObject<HTMLVideoElement | null>;
    isPlaying: boolean;
    setCurrentTime: (t: number) => void;
}) {
    const { data: session } = useAuthSession();
    const incrementView = trpc.content.incrementView.useMutation();
    const saveProgressMutation = trpc.content.saveProgress.useMutation();
    const { data: progressData } = trpc.content.getProgress.useQuery(
        { postId },
        { enabled: !!session?.user, staleTime: Infinity }
    );

    const viewIncremented = useRef(false);
    const resumeAppliedRef = useRef(false);
    const throttleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ── View-increment ────────────────────────────────────────────────────────
    useEffect(() => {
        if (isPlaying && !viewIncremented.current) {
            viewIncremented.current = true;
            incrementView.mutate({ postId, contentType: "video" });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isPlaying, postId]);

    // ── Resume from saved position ────────────────────────────────────────────
    // Apply once when metadata is loaded AND progressData is available
    useEffect(() => {
        if (resumeAppliedRef.current) return;
        const video = videoRef.current;
        if (!video || !progressData) return;

        const savedTime = session?.user
            ? progressData.currentTime
            : parseFloat(store.get(`ytp-progress-${postId}`, "0"));

        if (savedTime > 5) {
            const applyResume = () => {
                if (resumeAppliedRef.current) return;
                resumeAppliedRef.current = true;
                const duration = video.duration;
                // Never resume INTO the tail. Seeking within a few seconds of
                // the end fires `ended` almost immediately, and on a queue
                // surface (home's hero) `ended` advances to the next video —
                // which resumes into ITS tail, and so on. That is a runaway
                // cycle nobody can stop, not a resume.
                //
                // A non-finite duration is a live stream, which has no position
                // worth restoring either.
                if (!Number.isFinite(duration) || duration <= 0) return;
                if (savedTime > duration - RESUME_TAIL_SECONDS) return;
                video.currentTime = savedTime;
                setCurrentTime(savedTime);
            };
            if (video.readyState >= 1) {
                applyResume();
            } else {
                const onMeta = () => { applyResume(); video.removeEventListener("loadedmetadata", onMeta); };
                video.addEventListener("loadedmetadata", onMeta);
            }
        } else {
            resumeAppliedRef.current = true;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [progressData, postId, session?.user]);

    useEffect(() => { resumeAppliedRef.current = false; }, [postId]);

    // Drop a pending save when the player goes away. The timer's closure holds
    // the <video> ELEMENT, which outlives the component: after an unmount it is
    // detached, still readable, and frozen at the position it stopped on. So a
    // save scheduled during the last seconds of playback fires afterwards and
    // writes that position for the post that just finished — straight over the
    // reset below. The home hero remounts on every queue advance, which made
    // this fire on every single video it played.
    useEffect(() => () => {
        if (throttleRef.current) {
            clearTimeout(throttleRef.current);
            throttleRef.current = null;
        }
    }, [postId]);

    /** Call on every timeupdate — throttled to one write per 5s internally. */
    const recordProgress = useCallback((video: HTMLVideoElement) => {
        if (throttleRef.current) return;
        throttleRef.current = setTimeout(() => {
            throttleRef.current = null;
            const t = video.currentTime;
            const d = video.duration;
            // Never persist a finished video's position — see RESUME_TAIL_SECONDS.
            const finished =
                video.ended || (Number.isFinite(d) && d > 0 && t > d - RESUME_TAIL_SECONDS);
            if (t > 5 && !finished) {
                if (session?.user) saveProgressMutation.mutate({ postId, currentTime: t });
                else store.set(`ytp-progress-${postId}`, String(t));
            }
        }, 5000);
    }, [session?.user, postId, saveProgressMutation]);

    /** Call on `ended`, so the next watch starts from the beginning. */
    const clearProgress = useCallback(() => {
        if (session?.user) saveProgressMutation.mutate({ postId, currentTime: 0 });
        else store.set(`ytp-progress-${postId}`, "0");
    }, [session?.user, postId, saveProgressMutation]);

    return { recordProgress, clearProgress };
}
