"use client";

import { DoubleArrowUpIcon } from "@/components/icons";
import type { VttThumb } from "./use-preview-thumbnails";
// Shared with the frame capture so the card size and the capture size cannot
// drift apart — see preview-size.
import { CARD_W, CARD_H } from "./preview-size";

interface ThumbnailHoverProps {
    src: string | null;
    /** VTT-based thumbnail — takes priority over src when provided */
    vttThumb?: VttThumb | null;
    time: number;
    chapterTitle?: string;
    formatTime: (s: number) => string;
    leftPercent: number; // clamped 5..95
}


export function ThumbnailHover({ src, vttThumb, time, chapterTitle, formatTime, leftPercent }: ThumbnailHoverProps) {
    const clampedLeft = Math.min(Math.max(leftPercent, 5), 95);

    // Build background style — VTT sprite takes priority
    let bgStyle: React.CSSProperties = { backgroundColor: "#000" };
    if (vttThumb) {
        if (vttThumb.sprite) {
            const { x, y, w, h, imageW, imageH } = vttThumb.sprite;
            const scaleX = CARD_W / w;
            const scaleY = CARD_H / h;
            const scale = Math.min(scaleX, scaleY); // letterbox
            bgStyle = {
                backgroundImage: `url(${vttThumb.src})`,
                backgroundRepeat: "no-repeat",
                backgroundSize: `${imageW * scale}px ${imageH * scale}px`,
                backgroundPosition: `-${x * scale}px -${y * scale}px`,
                backgroundColor: "#000",
            };
        } else {
            bgStyle = {
                backgroundImage: `url(${vttThumb.src})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                backgroundColor: "#000",
            };
        }
    } else if (src) {
        bgStyle = {
            backgroundImage: `url(${src})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundColor: "#000",
        };
    }

    return (
        <div
            className="absolute bottom-full mb-4 -translate-x-1/2 pointer-events-none z-30 flex flex-col items-center gap-2"
            style={{ left: `${clampedLeft}%` }}
        >
            {/* Pull up hint */}
            <div className="flex items-center gap-1.5 text-white2 text-sm font-semibold whitespace-nowrap drop-shadow">
                <DoubleArrowUpIcon className="size-5" />
                Pull up for precise seeking
            </div>

            {/* Card */}
            <div
                style={{
                    border: "1px solid rgba(255,255,255,.75)",
                    boxShadow: "0 0 4px rgba(0,0,0,.5)",
                    borderRadius: 12,
                    overflow: "hidden",
                    width: CARD_W,
                    height: CARD_H,
                    position: "relative",
                    flexShrink: 0,
                }}
            >
                <div className="absolute inset-0" style={bgStyle} />

                {/* Top shadow */}
                <div className="absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-black/30 to-transparent" />

                {chapterTitle && (
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2.5 py-2 flex flex-col justify-end">
                        <div className="text-white text-[11px] font-medium leading-tight truncate">
                            {chapterTitle}
                        </div>
                    </div>
                )}
            </div>

            {/* Time */}
            <span className="text-white text-sm px-4 py-2 rounded-full bg-black/40 font-semibold tabular-nums drop-shadow">
                {formatTime(time)}
            </span>
        </div>
    );
}
