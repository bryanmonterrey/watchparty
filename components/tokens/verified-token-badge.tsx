import { VerifiedBadgeIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

/**
 * A coin's verified mark — the account badge, in the perps order ticket's long
 * green rather than blue.
 *
 * Same shape as a person's checkmark on purpose: it means the same thing, and
 * one mark is easier to learn than two. The colour is what separates them, so a
 * verified coin can never be misread as a verified creator.
 *
 * Which coins qualify is lib/tokens/verified.ts, not a prop — callers pass the
 * token, the rule stays in one place.
 */
export function VerifiedTokenBadge({ className }: { className?: string }) {
    return (
        <span
            aria-label="verified coin"
            title="Verified coin"
            className={cn(
                "inline-flex shrink-0 items-center justify-center rounded-full bg-long-soft p-0.5",
                className,
            )}
        >
            {/* fill, not text-*: the mark's colour is baked into its path. */}
            <VerifiedBadgeIcon className="size-3" fill="var(--color-long)" />
        </span>
    );
}
