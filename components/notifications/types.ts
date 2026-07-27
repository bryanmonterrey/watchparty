import {
    AtIcon,
    Comment01Icon,
    FavouriteIcon,
    Megaphone01Icon,
    Notification01Icon,
    QuoteDownIcon,
    RepeatIcon,
    TradeUpIcon,
    UserAdd01Icon,
} from "@hugeicons/core-free-icons"

export type Tab = "All" | "Comments"

// Per-type identity for the badge that rides the actor's avatar. Varied fills
// across the set (the design language's colour-as-identity rule) so the list is
// scannable by shape AND colour — but every fill is a flat tint of a palette
// token, never a gradient, and the panel's own accent (twitter blue) is
// reserved for unread state so it never competes with a type badge.
export const TYPE_CONFIG = {
    like: { icon: FavouriteIcon, color: "text-pastelred", bg: "bg-pastelred/15", label: "liked your post" },
    comment: { icon: Comment01Icon, color: "text-twitter", bg: "bg-twitter/15", label: "commented on your post" },
    repost: { icon: RepeatIcon, color: "text-lantern", bg: "bg-lantern/15", label: "reposted your post" },
    quote: { icon: QuoteDownIcon, color: "text-purple-400", bg: "bg-purple-400/15", label: "quoted your post" },
    follow: { icon: UserAdd01Icon, color: "text-white", bg: "bg-white/15", label: "started following you" },
    mention: { icon: AtIcon, color: "text-sunset", bg: "bg-sunset/15", label: "mentioned you" },
    callout: { icon: Megaphone01Icon, color: "text-lantern", bg: "bg-lantern/15", label: "made a callout" },
    trade: { icon: TradeUpIcon, color: "text-lantern2", bg: "bg-lantern2/15", label: "made a trade" },
    system: { icon: Notification01Icon, color: "text-zinc-400", bg: "bg-zinc-400/15", label: "" },
} satisfies Record<string, { icon: typeof FavouriteIcon; color: string; bg: string; label: string }>
