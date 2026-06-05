"use client";

import { useState } from "react";
import { AlertTriangle, Eye } from "lucide-react";
import { cn } from "@/lib/utils";

interface ContentWarningProps {
    warningText?: string | null;
    children: React.ReactNode;
    className?: string;
}

export function ContentWarning({ warningText, children, className }: ContentWarningProps) {
    const [revealed, setRevealed] = useState(false);

    if (revealed) return <>{children}</>;

    return (
        <div className={cn("relative rounded-xl overflow-hidden", className)}>
            {/* Blurred content behind */}
            <div className="blur-xl pointer-events-none select-none opacity-60">
                {children}
            </div>
            {/* Overlay */}
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-zinc-950/60 backdrop-blur-sm rounded-xl">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                <p className="text-sm font-semibold text-zinc-200">Content Warning</p>
                {warningText && <p className="text-xs text-zinc-400 text-center px-4">{warningText}</p>}
                <button
                    onClick={() => setRevealed(true)}
                    className="mt-1 flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-sm text-zinc-200 font-medium transition-colors"
                >
                    <Eye className="w-3.5 h-3.5" /> Show content
                </button>
            </div>
        </div>
    );
}
