import { Heart, MessageCircle, Repeat2, UserPlus, AtSign, Quote, Bell, Megaphone, TrendingUp } from "lucide-react"

export type Tab = "All" | "Comments"

// `filled`: the badge over the actor's avatar renders the glyph solid (owner,
// 2026-10-03: "the heart over the avatar should be filled in, same for
// anything else that can be — except repost"). Strokes-only glyphs (arrows,
// the @, the person-plus) have no fill to speak of and stay as they are.
export const TYPE_CONFIG = {
    like:    { icon: Heart,         filled: true,  color: "text-rose-500",    bg: "bg-rose-500/10",   label: "liked your post" },
    comment: { icon: MessageCircle, filled: true,  color: "text-sky-400",     bg: "bg-sky-400/10",    label: "commented on your post" },
    repost:  { icon: Repeat2,       filled: false, color: "text-green-500",   bg: "bg-green-500/10",  label: "reposted your post" },
    quote:   { icon: Quote,         filled: true,  color: "text-purple-400",  bg: "bg-purple-400/10", label: "quoted your post" },
    follow:  { icon: UserPlus,      filled: false, color: "text-white",       bg: "bg-white/10",      label: "started following you" },
    mention: { icon: AtSign,        filled: false, color: "text-amber-400",   bg: "bg-amber-400/10",  label: "mentioned you" },
    callout: { icon: Megaphone,     filled: true,  color: "text-lantern",     bg: "bg-lantern/10",    label: "made a callout" },
    trade:   { icon: TrendingUp,    filled: false, color: "text-lantern2",    bg: "bg-lantern2/10",   label: "made a trade" },
    system:  { icon: Bell,          filled: true,  color: "text-zinc-400",    bg: "bg-zinc-400/10",   label: "" },
} as const
