"use client";

import React from "react";
import type { BezelIcon } from "./types";

interface BezelProps {
    wrapRef: React.RefObject<HTMLDivElement | null>;
    circleRef: React.RefObject<HTMLDivElement | null>;
    icon: BezelIcon;
}

export function Bezel({ wrapRef, circleRef, icon }: BezelProps) {
    return (
        <div
            ref={wrapRef}
            className="absolute inset-0 z-[15] items-center justify-center pointer-events-none"
            style={{ display: "none" }}
        >
            <div
                ref={circleRef}
                style={{
                    width: 56, height: 56, borderRadius: "50%",
                    background: "rgba(0,0,0,0.6)",
                    backdropFilter: "blur(16px)",
                    WebkitBackdropFilter: "blur(16px)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                }}
            >
                {icon === "play" && (
                    <svg fill="none" height="36" viewBox="0 0 36 36" width="36">
                        <path d="M 17 8.6 L 10.89 4.99 C 9.39 4.11 7.5 5.19 7.5 6.93 C 7.5 6.93 7.5 6.93 7.5 6.93 L 7.5 29.06 C 7.5 30.8 9.39 31.88 10.89 31 C 10.89 31 10.89 31 10.89 31 L 17 27.4 C 17 27.4 17 27.4 17 27.4 C 17 27.4 17 27.4 17 27.4 L 17 8.6 C 17 8.6 17 8.6 17 8.6 C 17 8.6 17 8.6 17 8.6 Z M 17 8.6 L 17 8.6 C 17 8.6 17 8.6 17 8.6 C 17 8.6 17 8.6 17 8.6 V 27.4 C 17 27.4 17 27.4 17 27.4 C 17 27.4 17 27.4 17 27.4 L 33 18 C 33 18 33 18 33 18 C 33 18 33 18 33 18 V 18 L 17 8.6 C 17 8.6 17 8.6 17 8.6 C 17 8.6 17 8.6 17 8.6 Z" fill="white" />
                    </svg>
                )}
                {icon === "pause" && (
                    <svg fill="none" height="36" viewBox="0 0 36 36" width="36">
                        <path d="M 12.75 4.5 L 9.75 4.5 C 9.15 4.5 8.58 4.73 8.15 5.15 C 7.73 5.58 7.5 6.15 7.5 6.75 L 7.5 29.25 C 7.5 29.84 7.73 30.41 8.15 30.84 C 8.58 31.26 9.15 31.5 9.75 31.5 L 12.75 31.5 C 13.34 31.5 13.91 31.26 14.34 30.84 C 14.76 30.41 15 29.84 15 29.25 L 15 6.75 C 15 6.15 14.76 5.58 14.34 5.15 C 13.91 4.73 13.34 4.5 12.75 4.5 Z M 26.25 4.5 L 23.25 4.5 C 22.65 4.5 22.08 4.73 21.65 5.15 C 21.23 5.58 21 6.15 21 6.75 V 29.25 C 21 29.84 21.23 30.41 21.65 30.84 C 22.08 31.26 22.65 31.5 23.25 31.5 L 26.25 31.5 C 26.84 31.5 27.41 31.26 27.84 30.84 C 28.26 30.41 28.5 29.84 28.5 29.25 V 6.75 L 28.5 6.75 C 28.5 6.15 28.26 5.58 27.84 5.15 C 27.41 4.73 26.84 4.5 26.25 4.5 Z" fill="white" />
                    </svg>
                )}
                {icon === "forward" && (
                    <svg fill="white" height="36" viewBox="0 0 36 36" width="36">
                        <path d="M 7.5 8.6 L 7.5 27.4 L 17.5 18 Z M 17.5 8.6 L 17.5 27.4 L 27.5 18 Z" />
                    </svg>
                )}
                {icon === "back" && (
                    <svg fill="white" height="36" viewBox="0 0 36 36" width="36">
                        <path d="M 28.5 8.6 L 28.5 27.4 L 18.5 18 Z M 18.5 8.6 L 18.5 27.4 L 8.5 18 Z" />
                    </svg>
                )}
            </div>
        </div>
    );
}
