"use client";

import * as React from "react";
import { Coins, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface TokenIconProps {
    src?: string;
    symbol?: string;
    className?: string;
    innerClassName?: string;
    size?: "sm" | "md" | "lg" | "xl";
    showChainBadge?: boolean;
    type?: "token" | "nft";
}

const SOLANA_LOGO = "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png";

export function TokenIcon({
    src,
    symbol,
    className,
    innerClassName,
    size = "md",
    showChainBadge = false,
    type = "token",
}: TokenIconProps) {
    const [imageLoaded, setImageLoaded] = React.useState(false);
    const [imageError, setImageError] = React.useState(false);
    const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const imgRef = React.useRef<HTMLImageElement>(null);

    React.useEffect(() => {
        setImageLoaded(false);
        setImageError(false);

        if (!src) return;

        timerRef.current = setTimeout(() => {
            setImageError(true);
        }, 8000);

        // Cached images fire `load` before React attaches the handler — check after DOM commit.
        if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
            setImageLoaded(true);
        }

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [src]);

    const sizeClasses = {
        sm: "w-6 h-6",
        md: "w-9 h-9",
        lg: "w-10 h-10",
        xl: "w-12 h-12",
    };

    const iconSize = sizeClasses[size];

    return (
        <div className={cn("relative flex-shrink-0 flex items-center justify-center", iconSize, className)}>
            {src && !imageError ? (
                <>
                    {!imageLoaded && (
                        <div className={cn("absolute inset-0 w-full h-full shimmer-skeleton", type === "token" ? "rounded-full" : "rounded-none", innerClassName)} />
                    )}
                    <img
                        ref={imgRef}
                        src={src}
                        alt={symbol || "Token icon"}
                        className={cn(
                            "w-full h-full object-cover",
                            type === "token" ? "rounded-full" : "rounded-none",
                            !imageLoaded && "invisible",
                            innerClassName
                        )}
                        onLoad={() => {
                            if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
                            setImageLoaded(true);
                        }}
                        onError={() => {
                            if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
                            setImageError(true);
                        }}
                    />
                </>
            ) : (
                <div className={cn(
                    "w-full h-full bg-gradient-to-br from-zinc-700 to-zinc-800 flex items-center justify-center border border-zinc-700/50",
                    type === "token" ? "rounded-full" : "rounded-none",
                    innerClassName
                )}>
                    {type === "token" ? (
                        <span className="text-[10px] font-bold text-zinc-300">
                            <Coins className="w-4 h-4" />
                        </span>
                    ) : (
                        <ImageIcon className="w-5 h-5 text-zinc-600" />
                    )}
                </div>
            )}

            {showChainBadge && (
                <div className="absolute -bottom-0.5 -right-0.5 bg-[#131313] rounded-full p-[1px]">
                    <img src={SOLANA_LOGO} className="w-[10px] h-[10px] rounded-full" alt="Solana" />
                </div>
            )}
        </div>
    );
}
