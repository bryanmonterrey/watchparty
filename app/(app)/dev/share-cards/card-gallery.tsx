"use client";

import { useEffect, useState } from "react";
import type { CardFixture } from "@/lib/share/og-fixtures";

// Loads the fixture cards ONE AT A TIME. Each card is a CPU-bound satori +
// resvg render; fourteen fired at once queue for a minute on the local
// `wrangler dev` (and crashed it outright on 2026-09-03). Production spreads
// bursts across isolates, but the preview is mostly looked at locally.
export function CardGallery({ fixtures }: { fixtures: CardFixture[] }) {
    const [loaded, setLoaded] = useState(0);
    const [failed, setFailed] = useState<Set<number>>(() => new Set());

    // No "already started" guard: React's dev Strict Mode runs the effect,
    // cleans it up, and runs it again — a ref guard let the CANCELLED first
    // run win and the gallery stalled after one card. Each mount owns its own
    // loop and the cleanup cancels it.
    useEffect(() => {
        let cancelled = false;
        setLoaded(0);
        setFailed(new Set());
        (async () => {
            for (let i = 0; i < fixtures.length; i++) {
                if (cancelled) return;
                await new Promise<void>((resolve) => {
                    const img = new Image();
                    img.onload = () => resolve();
                    img.onerror = () => {
                        setFailed((s) => new Set(s).add(i));
                        resolve();
                    };
                    img.src = fixtures[i].path;
                });
                if (!cancelled) setLoaded(i + 1);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [fixtures]);

    return (
        <>
            {fixtures.map((f, i) => {
                const ready = i < loaded;
                const isFailed = failed.has(i);
                return (
                    <figure key={f.label} className={f.portrait ? "sm:row-span-2" : undefined}>
                        <figcaption className="mb-2 flex items-center gap-2 text-sm font-semibold">
                            {f.label}
                            <span className="font-mono text-xs font-medium text-postgray">/api/og/{f.template}</span>
                            {isFailed && <span className="text-xs font-medium text-pastelred">render failed</span>}
                        </figcaption>
                        <a
                            href={f.path}
                            target="_blank"
                            rel="noreferrer"
                            className="block overflow-hidden rounded-2xl border border-border bg-black"
                            style={{ aspectRatio: f.portrait ? "1080 / 1350" : "1200 / 630" }}
                        >
                            {ready && !isFailed ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={f.path} alt="" className="block size-full object-contain" />
                            ) : (
                                <div className="flex size-full items-center justify-center text-xs font-medium text-postgray">
                                    {isFailed ? "open to see the worker's error" : i === loaded ? "rendering…" : "queued"}
                                </div>
                            )}
                        </a>
                    </figure>
                );
            })}
        </>
    );
}
