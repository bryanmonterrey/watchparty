import { VerifiedBadgeIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

/**
 * A coin's verified mark — the account badge, in the perps order ticket's green
 * rather than blue.
 *
 * Same shape as a person's checkmark on purpose: it means the same thing, and
 * one mark is easier to learn than two. The colour is what separates them, so a
 * verified coin can never be misread as a verified creator.
 *
 * The tick is knocked out, not painted: this icon's single path winds the tick
 * as a hole, so it shows whatever sits behind the badge. Nothing goes behind it
 * — no chip, no disc — which is what keeps the tick transparent against the row
 * it lands on.
 *
 * Which coins qualify is lib/tokens/verified.ts, not a prop — callers pass the
 * token, the rule stays in one place.
 */
export function VerifiedTokenBadge({ className }: { className?: string }) {
    return (
        <VerifiedBadgeIcon
            aria-label="verified coin"
            role="img"
            fill="var(--color-long)"
            className={cn("size-4 shrink-0", className)}
        />
    );
}
