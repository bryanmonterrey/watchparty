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
        <div className="rounded-3xl bg-white p-7 ring-1 ring-black/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] transition-transform duration-200 ease-out hover:-translate-y-1">
            <span className={cn("mb-5 grid size-12 place-items-center rounded-2xl bg-current/10", accent)}>
                <HugeiconsIcon icon={icon} size={26} strokeWidth={1.8} className={accent} />
            </span>
            <p className="text-xl font-extrabold tracking-tight text-black">{title}</p>
            <p className="mt-1.5 text-[15px] font-semibold leading-snug text-black/60">{body}</p>
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
