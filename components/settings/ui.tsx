"use client";

import type { ComponentProps, ReactNode } from "react";
import { Squircle } from "@/components/ui/squircle";
import { cn } from "@/lib/utils";

// Shared chrome for settings panels: one radius scale (24), bg-panel fills,
// no border dividers — rows separate by spacing + hover tint.

export function Panel({ className, children }: { className?: string; children: ReactNode }) {
    return (
        <Squircle asChild radius={24} autoEffects={false}>
            <div className={cn("bg-panel", className)}>{children}</div>
        </Squircle>
    );
}

export function PanelHeader({ title, badge, action }: { title: string; badge?: ReactNode; action?: ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
                <h2 className="text-[16px] font-bold tracking-tight text-white">{title}</h2>
                {badge}
            </div>
            {action}
        </div>
    );
}

export function FieldLabel({ children }: { children: ReactNode }) {
    return <label className="text-[12px] font-medium text-zinc-500">{children}</label>;
}

export function EmptyState({ title, hint }: { title: string; hint: string }) {
    return (
        <Panel className="px-6 py-12 text-center">
            <p className="text-[14px] font-bold text-zinc-400">{title}</p>
            <p className="mt-1 text-[12px] font-medium text-zinc-600">{hint}</p>
        </Panel>
    );
}

export function PanelSkeleton({ rows = 3, rowClassName = "h-16" }: { rows?: number; rowClassName?: string }) {
    return (
        <div className="flex flex-col gap-3">
            {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className={cn("overflow-hidden rounded-[20px]", rowClassName)}>
                    <div className="size-full shimmer-skeleton" />
                </div>
            ))}
        </div>
    );
}

// Primary = white pill (one per surface); secondary = quiet neutral pill.
// Height standard: h-11 default; wide (w-full / flex-1) CTAs pass h-12.
export function PillButton({
    variant = "secondary",
    className,
    ...props
}: ComponentProps<"button"> & { variant?: "primary" | "secondary" }) {
    return (
        <button
            className={cn(
                "inline-flex h-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full px-4 text-[13px] font-bold transition-colors active:scale-95 disabled:pointer-events-none disabled:opacity-50",
                variant === "primary"
                    ? "bg-white text-black hover:bg-white/90"
                    : "bg-white/10 text-white hover:bg-white/20",
                className,
            )}
            {...props}
        />
    );
}
