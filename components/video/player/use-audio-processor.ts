"use client";

import { useRef, useState, useCallback, useEffect } from "react";

export interface AudioProcessorReturn {
    stableVolume: boolean;
    voiceBoost: boolean;
    spatialBoost: boolean;
    toggleStableVolume: () => void;
    toggleVoiceBoost: () => void;
    toggleSpatialBoost: () => void;
}

// Ramp a param smoothly to avoid clicks (cancel any queued automation first)
function ramp(param: AudioParam, value: number, ctx: AudioContext, dt = 0.06) {
    param.cancelScheduledValues(ctx.currentTime);
    param.setValueAtTime(param.value, ctx.currentTime);
    param.linearRampToValueAtTime(value, ctx.currentTime + dt);
}

export function useAudioProcessor(
    videoRef: React.RefObject<HTMLVideoElement | null>
): AudioProcessorReturn {
    const ctxRef = useRef<AudioContext | null>(null);
    const compressorRef = useRef<DynamicsCompressorNode | null>(null);
    const voiceFilterRef = useRef<BiquadFilterNode | null>(null);
    const spatialGainsRef = useRef<{
        ll: GainNode; rl: GainNode; rr: GainNode; lr: GainNode;
    } | null>(null);

    const [stableVolume, setStableVolume] = useState(false);
    const [voiceBoost, setVoiceBoost] = useState(false);
    const [spatialBoost, setSpatialBoost] = useState(false);

    // Build the audio graph on first toggle. Creating early (before user gesture)
    // would leave AudioContext in suspended state and mute the video on some browsers.
    const init = useCallback((): AudioContext | null => {
        if (ctxRef.current) return ctxRef.current;
        const video = videoRef.current;
        if (!video) return null;

        let ctx: AudioContext;
        try {
            ctx = new AudioContext();
            // Route video audio through Web Audio API
            const source = ctx.createMediaElementSource(video);

            // ── Stable Volume: DynamicsCompressor ─────────────────────────────
            // Neutral at start (ratio=1 → unity gain regardless of threshold)
            const compressor = ctx.createDynamicsCompressor();
            compressor.threshold.value = 0;
            compressor.knee.value = 40;
            compressor.ratio.value = 1;
            compressor.attack.value = 0.003;
            compressor.release.value = 0.25;
            compressorRef.current = compressor;

            // ── Voice Boost: peaking EQ at 2.5 kHz ───────────────────────────
            // gain=0 → flat response (effective bypass)
            const voiceFilter = ctx.createBiquadFilter();
            voiceFilter.type = "peaking";
            voiceFilter.frequency.value = 2500;
            voiceFilter.Q.value = 0.9;
            voiceFilter.gain.value = 0;
            voiceFilterRef.current = voiceFilter;

            // ── Spatial Boost: M/S stereo widener ─────────────────────────────
            // L_out = L*(1+k)/2 + R*(1-k)/2
            // R_out = L*(1-k)/2 + R*(1+k)/2
            // k=1 → passthrough, k=1.6 → widened
            const splitter = ctx.createChannelSplitter(2);
            const merger = ctx.createChannelMerger(2);
            const ll = ctx.createGain(); ll.gain.value = 1;   // L→L
            const rl = ctx.createGain(); rl.gain.value = 0;   // R→L cross-feed
            const rr = ctx.createGain(); rr.gain.value = 1;   // R→R
            const lr = ctx.createGain(); lr.gain.value = 0;   // L→R cross-feed

            splitter.connect(ll, 0);        // chan 0 (L) → ll
            splitter.connect(rl, 1);        // chan 1 (R) → rl
            splitter.connect(rr, 1);        // chan 1 (R) → rr
            splitter.connect(lr, 0);        // chan 0 (L) → lr

            ll.connect(merger, 0, 0);       // ll → L output
            rl.connect(merger, 0, 0);       // rl → L output (summed)
            rr.connect(merger, 0, 1);       // rr → R output
            lr.connect(merger, 0, 1);       // lr → R output (summed)

            spatialGainsRef.current = { ll, rl, rr, lr };

            // ── Chain ─────────────────────────────────────────────────────────
            source.connect(compressor);
            compressor.connect(voiceFilter);
            voiceFilter.connect(splitter);
            merger.connect(ctx.destination);

            ctxRef.current = ctx;
            return ctx;
        } catch (e) {
            // CORS or browser restriction — audio processor unavailable
            console.warn("[audio-processor] init failed:", e);
            return null;
        }
    }, [videoRef]);

    useEffect(() => {
        return () => {
            ctxRef.current?.close().catch(() => {});
            ctxRef.current = null;
        };
    }, []);

    const toggleStableVolume = useCallback(() => {
        const ctx = init();
        if (!ctx || !compressorRef.current) return;
        void ctx.resume();
        setStableVolume(prev => {
            const next = !prev;
            const c = compressorRef.current!;
            if (next) {
                ramp(c.threshold, -24, ctx);
                ramp(c.ratio, 8, ctx);
                ramp(c.knee, 20, ctx);
                ramp(c.attack, 0.001, ctx);
                ramp(c.release, 0.4, ctx);
            } else {
                ramp(c.threshold, 0, ctx);
                ramp(c.ratio, 1, ctx);
                ramp(c.knee, 40, ctx);
            }
            return next;
        });
    }, [init]);

    const toggleVoiceBoost = useCallback(() => {
        const ctx = init();
        if (!ctx || !voiceFilterRef.current) return;
        void ctx.resume();
        setVoiceBoost(prev => {
            const next = !prev;
            ramp(voiceFilterRef.current!.gain, next ? 6 : 0, ctx);
            return next;
        });
    }, [init]);

    const toggleSpatialBoost = useCallback(() => {
        const ctx = init();
        if (!ctx || !spatialGainsRef.current) return;
        void ctx.resume();
        setSpatialBoost(prev => {
            const next = !prev;
            const { ll, rl, rr, lr } = spatialGainsRef.current!;
            const k = next ? 1.6 : 1.0;
            const diag = (1 + k) / 2;  // 1.3 on / 1.0 off
            const cross = (1 - k) / 2; // -0.3 on / 0.0 off
            ramp(ll.gain, diag, ctx);
            ramp(rr.gain, diag, ctx);
            ramp(rl.gain, cross, ctx);
            ramp(lr.gain, cross, ctx);
            return next;
        });
    }, [init]);

    return { stableVolume, voiceBoost, spatialBoost, toggleStableVolume, toggleVoiceBoost, toggleSpatialBoost };
}
