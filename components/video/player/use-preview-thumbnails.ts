"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export interface VttFrame {
    startTime: number;
    endTime: number;
    /** URL of the image (may be a sprite sheet) */
    text: string;
    /** Sprite x offset in px, if sprite sheet */
    x?: number;
    /** Sprite y offset in px, if sprite sheet */
    y?: number;
    /** Sprite frame width in px */
    w?: number;
    /** Sprite frame height in px */
    h?: number;
}

export interface VttThumbnailDef {
    frames: VttFrame[];
    /** Natural pixel height of the image (set after first image loads) */
    height: number;
    /** Natural pixel width of the image */
    width: number;
    /** URL prefix for relative paths in the VTT */
    urlPrefix: string;
}

export interface VttThumb {
    /** Full URL to the image */
    src: string;
    /** If sprite: background-position / size props ready for a div */
    sprite?: {
        x: number;
        y: number;
        w: number;
        h: number;
        imageW: number;
        imageH: number;
    };
}

/** Parse a WEBVTT string into an array of VttFrame objects */
function parseVtt(vttString: string): VttFrame[] {
    const result: VttFrame[] = [];
    const blocks = vttString.split(/\r\n\r\n|\n\n|\r\r/);

    for (const block of blocks) {
        const frame: Partial<VttFrame> = {};
        const lines = block.split(/\r\n|\n|\r/);
        for (const line of lines) {
            if (frame.startTime === undefined) {
                const m = line.match(
                    /(\d{2})?:?(\d{2}):(\d{2})\.(\d{2,3})\s*-->\s*(\d{2})?:?(\d{2}):(\d{2})\.(\d{2,3})/
                );
                if (m) {
                    frame.startTime =
                        Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(`0.${m[4]}`);
                    frame.endTime =
                        Number(m[5] || 0) * 3600 + Number(m[6]) * 60 + Number(m[7]) + Number(`0.${m[8]}`);
                }
            } else if (!frame.text && line.trim()) {
                const parts = line.trim().split("#xywh=");
                frame.text = parts[0].trim();
                if (parts[1]) {
                    const [x, y, w, h] = parts[1].split(",").map(Number);
                    frame.x = x; frame.y = y; frame.w = w; frame.h = h;
                }
            }
        }
        if (frame.text && frame.startTime !== undefined) {
            result.push(frame as VttFrame);
        }
    }
    return result;
}

async function fetchVtt(url: string): Promise<VttThumbnailDef> {
    const res = await fetch(url);
    const text = await res.text();
    const frames = parseVtt(text);
    if (frames.length === 0) throw new Error("Empty VTT");

    // Determine URL prefix for relative image paths
    let urlPrefix = "";
    const firstText = frames[0].text;
    if (!firstText.startsWith("/") && !firstText.startsWith("http://") && !firstText.startsWith("https://")) {
        urlPrefix = url.substring(0, url.lastIndexOf("/") + 1);
    }

    // Load first image to get natural dimensions
    const imgSrc = urlPrefix + firstText;
    const { width, height } = await new Promise<{ width: number; height: number }>((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => resolve({ width: 0, height: 0 });
        img.src = imgSrc;
    });

    return { frames, height, width, urlPrefix };
}

/**
 * Loads VTT thumbnail definitions and returns the best available thumbnail
 * for the current hover time. Supports both individual frames and sprite sheets.
 *
 * thumbnailVttUrls should be sorted smallest to largest quality so quality
 * escalation upgrades to higher-res versions after a short delay.
 */
export function usePreviewThumbnails(
    thumbnailVttUrls: string | string[] | null | undefined,
    hoverTime: number | null
): VttThumb | null {
    const [thumbnails, setThumbnails] = useState<VttThumbnailDef[]>([]);
    const [thumb, setThumb] = useState<VttThumb | null>(null);
    const loadedRef = useRef(false);
    const showingIndexRef = useRef<number | null>(null);
    const loadedImagesRef = useRef<Set<string>>(new Set());
    const qualityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Load all VTT files when URLs change
    useEffect(() => {
        const urls = !thumbnailVttUrls
            ? []
            : Array.isArray(thumbnailVttUrls)
                ? thumbnailVttUrls
                : [thumbnailVttUrls];

        if (urls.length === 0) {
            setThumbnails([]);
            loadedRef.current = false;
            return;
        }

        let cancelled = false;
        Promise.all(urls.map(u => fetchVtt(u).catch(() => null)))
            .then(results => {
                if (cancelled) return;
                const valid = results.filter(Boolean) as VttThumbnailDef[];
                // Sort smallest to largest by height (for quality escalation)
                valid.sort((a, b) => a.height - b.height);
                setThumbnails(valid);
                loadedRef.current = valid.length > 0;
            });

        return () => { cancelled = true; };
    }, [thumbnailVttUrls]);

    const getThumbForTime = useCallback((time: number, qualityIndex: number, defs: VttThumbnailDef[]): VttThumb | null => {
        if (defs.length === 0) return null;
        const def = defs[Math.min(qualityIndex, defs.length - 1)];
        const frameIdx = def.frames.findIndex(f => time >= f.startTime && time <= f.endTime);
        if (frameIdx < 0) return null;
        const frame = def.frames[frameIdx];
        const src = def.urlPrefix + frame.text;

        if (frame.w !== undefined && frame.y !== undefined && frame.x !== undefined && frame.h !== undefined) {
            return {
                src,
                sprite: { x: frame.x, y: frame.y, w: frame.w, h: frame.h, imageW: def.width, imageH: def.height },
            };
        }
        return { src };
    }, []);

    // Preload a nearby image so it's cached before the user hovers there
    const preloadNearby = useCallback((frameIdx: number, forward: boolean, def: VttThumbnailDef) => {
        const frames = forward
            ? def.frames.slice(frameIdx + 1)
            : def.frames.slice(0, frameIdx).reverse();
        const currentText = def.frames[frameIdx].text;
        for (const frame of frames) {
            if (frame.text !== currentText) {
                const url = def.urlPrefix + frame.text;
                if (!loadedImagesRef.current.has(url)) {
                    const img = new Image();
                    img.onload = () => loadedImagesRef.current.add(url);
                    img.src = url;
                }
                break;
            }
        }
    }, []);

    // Update displayed thumb when hoverTime changes
    useEffect(() => {
        if (hoverTime === null || thumbnails.length === 0) {
            setThumb(null);
            showingIndexRef.current = null;
            if (qualityTimerRef.current) clearTimeout(qualityTimerRef.current);
            return;
        }

        const frameIdx = thumbnails[0].frames.findIndex(f => hoverTime >= f.startTime && hoverTime <= f.endTime);
        if (frameIdx < 0) { setThumb(null); return; }

        if (frameIdx !== showingIndexRef.current) {
            showingIndexRef.current = frameIdx;
            setThumb(getThumbForTime(hoverTime, 0, thumbnails));

            // Preload adjacent frames
            preloadNearby(frameIdx, true, thumbnails[0]);
            preloadNearby(frameIdx, false, thumbnails[0]);
        }

        // Quality escalation: after 300ms on same frame, upgrade to higher quality
        if (qualityTimerRef.current) clearTimeout(qualityTimerRef.current);
        if (thumbnails.length > 1) {
            qualityTimerRef.current = setTimeout(() => {
                if (showingIndexRef.current !== frameIdx) return;
                // Find best available quality
                let bestQuality = 0;
                for (let q = thumbnails.length - 1; q >= 0; q--) {
                    const frame = thumbnails[q].frames[frameIdx];
                    if (frame && loadedImagesRef.current.has(thumbnails[q].urlPrefix + frame.text)) {
                        bestQuality = q;
                        break;
                    }
                }
                const upgraded = getThumbForTime(hoverTime, bestQuality, thumbnails);
                if (upgraded) setThumb(upgraded);
            }, 300);
        }
    }, [hoverTime, thumbnails, getThumbForTime, preloadNearby]);

    return thumbnails.length > 0 ? thumb : null;
}
