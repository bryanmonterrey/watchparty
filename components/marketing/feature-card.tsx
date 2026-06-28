import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { cn } from "@/lib/utils";
import { Reveal } from "./motion";

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
        <div className="flex h-full min-h-[260px] flex-col rounded-[28px] bg-white p-8 ring-1 ring-black/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] transition-transform duration-200 ease-out hover:-translate-y-1">
            <span className={cn("mb-auto grid size-16 place-items-center rounded-3xl bg-current/10", accent)}>
                <HugeiconsIcon icon={icon} size={32} strokeWidth={1.7} className={accent} />
            </span>
            <p className="mt-8 text-2xl font-extrabold tracking-tight text-black">{title}</p>
            <p className="mt-2 text-base font-semibold leading-snug text-black/60">{body}</p>
        </div>
    );
}

export function FeatureGrid({ features }: { features: Feature[] }) {
    return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f, i) => (
                <Reveal key={f.title} delay={(i % 3) * 0.06}>
                    <FeatureCard {...f} />
                </Reveal>
            ))}
        </div>
    );
}
