import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { cn } from "@/lib/utils";

// Neutral, compact feature card (Cash App-ish): white fill, tight padding, a
// small accent icon tile, whisper hairline (no gray/black drop shadow per
// docs/design-principles.md), subtle hover lift. Icons are HugeIcons.
export interface Feature {
    icon: IconSvgElement;
    title: string;
    body: string;
    /** Tailwind text-color class for the icon (tile uses its /10 wash). */
    accent?: string;
}

export function FeatureCard({ icon, title, body, accent = "text-twitter" }: Feature) {
    return (
        <div className="rounded-2xl bg-white p-5 ring-1 ring-black/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] transition-transform duration-200 ease-out hover:-translate-y-0.5">
            <span className={cn("mb-3 grid size-9 place-items-center rounded-xl bg-current/10", accent)}>
                <HugeiconsIcon icon={icon} size={20} strokeWidth={1.8} className={accent} />
            </span>
            <p className="text-base font-bold tracking-tight text-black">{title}</p>
            <p className="mt-1 text-sm font-semibold leading-snug text-black/65">{body}</p>
        </div>
    );
}

export function FeatureGrid({ features }: { features: Feature[] }) {
    return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
                <FeatureCard key={f.title} {...f} />
            ))}
        </div>
    );
}
