import { Heart, MessageCircle, Repeat2, UserPlus, AtSign, Quote, Bell } from "lucide-react"

export type Tab = "All" | "Comments"

export const TYPE_CONFIG = {
    like:    { icon: Heart,         color: "text-rose-500",    bg: "bg-rose-500/10",   label: "liked your post" },
    comment: { icon: MessageCircle, color: "text-sky-400",     bg: "bg-sky-400/10",    label: "commented on your post" },
    repost:  { icon: Repeat2,       color: "text-green-500",   bg: "bg-green-500/10",  label: "reposted your post" },
    quote:   { icon: Quote,         color: "text-purple-400",  bg: "bg-purple-400/10", label: "quoted your post" },
    follow:  { icon: UserPlus,      color: "text-lantern",     bg: "bg-lantern/10",    label: "started following you" },
    mention: { icon: AtSign,        color: "text-amber-400",   bg: "bg-amber-400/10",  label: "mentioned you" },
    system:  { icon: Bell,          color: "text-zinc-400",    bg: "bg-zinc-400/10",   label: "" },
} as const
