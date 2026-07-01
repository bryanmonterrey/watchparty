import { cn } from "@/lib/utils";

// Seamless marketing background: one continuous vertical gradient painted behind
// the whole page, so the canvas color *drifts* as you scroll instead of stacking
// visible colored bands. Every section on top is transparent — the gradient is
// the only background — which is why there are no section seams. Dark moments are
// floating rounded panels (see InsetBlock) so they don't cut a hard edge either.
//
// `stops` are CSS colors (use the brand tokens, e.g. "var(--color-soft-pink)"),
// optionally with a position ("var(--color-soft-blue) 60%"). Give each page its
// own journey so no two pages share a palette.
export function GradientPage({
    stops,
    children,
    className,
}: {
    stops: string[];
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div className={cn("relative isolate", className)}>
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0 -z-10"
                style={{ background: `linear-gradient(to bottom, ${stops.join(", ")})` }}
            />
            {children}
        </div>
    );
}
