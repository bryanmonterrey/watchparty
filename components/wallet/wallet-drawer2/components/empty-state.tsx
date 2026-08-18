import * as React from "react";

interface EmptyStateProps {
    /** Optional glyph. Pass a rendered node (HugeiconsIcon or a brand icon). */
    icon?: React.ReactNode;
    title: string;
    description: string;
}

// Two lines, the house pattern: a bold zinc-400 title and a 12px zinc-600 hint.
// The icon prop used to be typed `LucideIcon`, which is what kept lucide alive
// in every caller — it takes a node now, so callers pass whatever icon set they
// already use.
export function EmptyState({ icon, title, description }: EmptyStateProps) {
    return (
        <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
            {icon ? (
                <div className="mb-4 grid size-12 place-items-center rounded-full bg-white/[0.04] text-zinc-600">
                    {icon}
                </div>
            ) : null}
            <p className="text-15 font-bold tracking-tight text-zinc-400">{title}</p>
            <p className="mt-1 max-w-[240px] text-12 font-medium leading-relaxed text-zinc-600">
                {description}
            </p>
        </div>
    );
}
