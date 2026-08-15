"use client";

// The "most replayed" hits line above the scrubber, drawn as an ordered DITHER
// instead of a gradient fade.
//
// Ported from RevenueLineChart in Subhan-code/Amicro--Micro-transitions-
// (src/components/dither-charts/RevenueLineChart.tsx, plus the useCanvasSetup
// hook it depends on), which is where the look comes from: stroke the line,
// close the path down to the baseline, clip to it, then fill a grid of squares
// whose SIZE falls off with depth. Dots stay square and evenly spaced; only
// their weight changes, so the fade is made of flat marks rather than a ramp of
// alpha — which is the point, since docs/design-principles.md rules gradients
// out and this replaced a white->transparent `linearGradient`.
//
// CANVAS, not SVG, and that is not a style preference. The heatmap box is the
// full player width but only 40px tall, so an SVG doing this would need
// `preserveAspectRatio="none"` to stretch the path — and that same stretch
// turns every dot into a smeared ellipse (~9:0.4 on a wide player). Canvas
// draws in device pixels, so the marks stay square at any width.
//
// Changes from upstream: the between-datasets morph is gone (a video's buckets
// don't change while you hover), the loop is gated on `active` so it costs
// nothing until the scrubber is actually hovered, and the palette is fixed
// white — the player paints its own always-dark surface, so theme tokens would
// invert on Light (see CLAUDE.md).

import { useEffect, useRef, useState } from "react";

/** Headroom above the tallest bucket, so the stroke isn't clipped by the top. */
const HEADROOM = 1.15;

const LINE_WIDTH = 2;
const LINE_INK = "rgba(255,255,255,0.9)";
const DOT_INK = "rgba(255,255,255,0.55)";

/** Baseline height of the flat band drawn when a video has no buckets yet. */
const FLAT_FALLBACK = 0.3;

const smoothstep = (min: number, max: number, value: number) => {
    const x = Math.max(0, Math.min(1, (value - min) / (max - min)));
    return x * x * (3 - 2 * x);
};

/** Cheap deterministic jitter, so the grid reads as a dither and not as a mesh. */
const hash = (x: number, y: number) => {
    const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return h - Math.floor(h);
};

export function DitherHeatmap({ buckets, active }: { buckets: number[]; active: boolean }) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const size = useRef({ width: 0, height: 0 });
    const data = useRef(buckets);
    data.current = buckets;

    // Read once on mount, not per frame. The canvas is outside framer-motion's
    // reach, so MotionConfig's `reducedMotion="user"` does not cover it.
    const [reducedMotion] = useState(
        () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    );

    // Cache the logical size from a ResizeObserver rather than measuring inside
    // the frame loop, which would force a layout on every tick.
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ro = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                size.current = { width, height };
                const dpr = Math.min(window.devicePixelRatio || 1, 2);
                canvas.width = Math.round(width * dpr);
                canvas.height = Math.round(height * dpr);
            }
        });
        ro.observe(canvas);
        return () => ro.disconnect();
    }, []);

    useEffect(() => {
        // Only alive while the scrubber is hovered — the box is transparent
        // otherwise, so a running loop would be pure cost on a page that is
        // already decoding video.
        if (!active) return;

        let frame = 0;
        let time = 0;

        const draw = () => {
            const canvas = canvasRef.current;
            const ctx = canvas?.getContext("2d");
            const { width: w, height: h } = size.current;
            if (!canvas || !ctx || w === 0 || h === 0) {
                frame = requestAnimationFrame(draw);
                return;
            }

            time += reducedMotion ? 0 : 0.02;

            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            ctx.save();
            ctx.scale(dpr, dpr);
            ctx.clearRect(0, 0, w, h);

            const values = data.current;
            const cell = Math.max(2, Math.round(w / 200));

            ctx.beginPath();
            if (values.length < 2) {
                // No buckets yet: a flat band, the shape the SVG used to fall
                // back to, so the treatment is the same either way.
                const y = h - FLAT_FALLBACK * h;
                ctx.moveTo(0, y);
                ctx.lineTo(w, y);
            } else {
                const stepX = w / (values.length - 1);
                for (let i = 0; i < values.length; i++) {
                    const y = h - (values[i] / HEADROOM) * h;
                    if (i === 0) ctx.moveTo(0, y);
                    else ctx.lineTo(i * stepX, y);
                }
            }

            ctx.lineWidth = LINE_WIDTH;
            ctx.strokeStyle = LINE_INK;
            ctx.lineJoin = "round";
            ctx.lineCap = "round";
            ctx.stroke();

            // Close the stroked line down to the baseline and clip the dots to
            // it, so the field only ever fills what is under the line.
            ctx.lineTo(w, h);
            ctx.lineTo(0, h);
            ctx.closePath();

            ctx.save();
            ctx.clip();
            ctx.fillStyle = DOT_INK;

            for (let x = 0; x <= w; x += cell) {
                for (let y = 0; y <= h; y += cell) {
                    const jx = x + cell / 2;
                    const jy = y + cell / 2;
                    const jit = hash(jx, jy);

                    // Depth falloff: heaviest against the line, gone by the
                    // baseline. This is what replaces the alpha ramp.
                    const falloff = Math.max(0, 1 - jy / h);
                    const waveRaw = reducedMotion
                        ? 0
                        : Math.sin(jx * 0.05 + time) + Math.sin(jy * 0.05 + time * 0.7);
                    const mod = smoothstep(-1.5, 1.5, waveRaw);

                    const sz = cell * (0.3 * falloff + 0.3 * mod) * (0.8 + 0.4 * jit);
                    if (sz > 0) ctx.fillRect(x + (cell - sz) / 2, y + (cell - sz) / 2, sz, sz);
                }
            }

            ctx.restore();
            ctx.restore();

            // Keep looping even under reduced motion, where `time` never
            // advances and every frame is identical: the alternative is drawing
            // once and going stale the moment the player is resized or goes
            // fullscreen mid-hover. It only runs while hovered.
            frame = requestAnimationFrame(draw);
        };

        frame = requestAnimationFrame(draw);
        return () => cancelAnimationFrame(frame);
    }, [active, reducedMotion]);

    return <canvas ref={canvasRef} aria-hidden className="h-full w-full" />;
}
