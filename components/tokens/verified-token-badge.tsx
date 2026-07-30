import { VerifiedTwoToneIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

/**
 * A coin's verified mark — the account badge, in the perps order ticket's green
 * rather than blue.
 *
 * Same shape as a person's checkmark on purpose: it means the same thing, and
 * one mark is easier to learn than two. The colour is what separates them, so a
 * verified coin can never be misread as a verified creator.
 *
 * Two tones, not one on a coloured chip. VerifiedBadgeIcon draws the tick as a
 * hole in the badge, so colouring it green gave a green badge with a see-through
 * tick sitting on a pale disc — the inverse of the intent. VerifiedTwoToneIcon
 * fills the body and the tick separately: long-soft ground, long tick.
 *
 * Which coins qualify is lib/tokens/verified.ts, not a prop — callers pass the
 * token, the rule stays in one place.
 */
export function VerifiedTokenBadge({ className }: { className?: string }) {
    return (
        <VerifiedTwoToneIcon
            aria-label="verified coin"
            role="img"
            ground="var(--color-long-soft)"
            mark="var(--color-long)"
            className={cn("size-4 shrink-0", className)}
        />
    );
}
