import { BarsIcon } from "@/components/icons";
import { cn, compactCount } from "@/lib/utils";
import { PopNumber } from "@/components/ui/pop-number";

/**
 * A view count, read as the engagement bar plus a shortened number.
 *
 * Post cards established it: the bars mark IS the view count, so the word
 * "views" beside a raw figure was the same thing said twice. This is that
 * reading as one object, so the stat looks identical in the hero header, the
 * rail rows, the watch page and the feed cards instead of each spelling it out
 * its own way with its own private formatter.
 *
 * Renders nothing when there is no count — an absent stat beats "0 views".
 */
export function ViewsStat({
    views,
    className,
    iconClassName,
}: {
    views?: number | null;
    className?: string;
    /** Size the mark to the surrounding type — size-4 suits 15–17px text. */
    iconClassName?: string;
}) {
    if (views == null) return null;
    return (
        <span className={cn("flex items-center gap-1 tabular-nums", className)}>
            <BarsIcon className={cn("size-6 shrink-0", iconClassName)} />
            <PopNumber value={compactCount(views)} />
        </span>
    );
}
