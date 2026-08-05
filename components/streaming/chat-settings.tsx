"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
    ArrowLeft01Icon,
    ArrowRight01Icon,
    Cancel01Icon,
    LinkSquare02Icon,
} from "@hugeicons/core-free-icons";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { BadgeGlyph } from "@/components/profile/badge-glyphs";
import { CHAT_NAME_COLORS, resolveChatNameColor } from "@/lib/chat/chat-name-color";
import { CHAT_FONT_CLASS, type ChatFontSize, type ChatPrefs } from "@/hooks/use-chat-prefs";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// Chat Settings, as an overlay ON the chat panel rather than a dialog.
//
// It's a drill-down stack, which is why Identity has a back chevron AND a close
// — the shield beside the composer opens Identity directly, and back returns to
// the menu it was never on. One `screen` state serves both entry points.
//
// Pop-out is a link, not a screen: it opens /popout/chat/<userId>, a bare route
// with no app chrome, sized for a second monitor.

type Screen = "menu" | "identity" | "appearance" | "muted";

export function ChatSettings({
    hostUserId,
    initialScreen = "menu",
    prefs,
    onPrefs,
    onClose,
}: {
    hostUserId: string;
    initialScreen?: Screen;
    prefs: ChatPrefs;
    onPrefs: (patch: Partial<ChatPrefs>) => void;
    onClose: () => void;
}) {
    const [screen, setScreen] = useState<Screen>(initialScreen);

    const title =
        screen === "identity" ? "Identity"
            : screen === "appearance" ? "Chat Appearance"
                : screen === "muted" ? "Muted Users"
                    : "Chat Settings";

    return (
        // Opaque and inset-0 over the chat column: the messages behind it keep
        // arriving, and a translucent sheet over moving text is unreadable.
        <div className="absolute inset-0 z-30 flex flex-col bg-canvas">
            <div className="flex items-center gap-2 px-1 pb-3 pt-1">
                {screen !== "menu" && (
                    <button
                        type="button"
                        onClick={() => setScreen("menu")}
                        aria-label="back"
                        className="cursor-pointer text-zinc-400 transition-colors hover:text-white"
                    >
                        <HugeiconsIcon icon={ArrowLeft01Icon} className="size-5" strokeWidth={2.5} />
                    </button>
                )}
                <h2 className="flex-1 text-[15px] font-bold text-flexwhite">{title}</h2>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="close settings"
                    className="cursor-pointer text-zinc-400 transition-colors hover:text-white"
                >
                    <HugeiconsIcon icon={Cancel01Icon} className="size-5" strokeWidth={2.5} />
                </button>
            </div>

            <div className="hidden-scrollbar min-h-0 flex-1 overflow-y-auto px-1 pb-2">
                {screen === "menu" && <Menu onOpen={setScreen} hostUserId={hostUserId} />}
                {screen === "identity" && <Identity hostUserId={hostUserId} />}
                {screen === "appearance" && <Appearance prefs={prefs} onPrefs={onPrefs} />}
                {screen === "muted" && <Muted />}
            </div>
        </div>
    );
}

// ─── Menu ────────────────────────────────────────────────────────────────────

function Row({ label, onClick }: { label: string; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="flex w-full cursor-pointer items-center justify-between rounded-lg px-2 py-3 text-left text-[15px] font-medium text-flexwhite transition-colors hover:bg-white/[0.06]"
        >
            {label}
            <HugeiconsIcon icon={ArrowRight01Icon} className="size-4 text-zinc-500" strokeWidth={2.5} />
        </button>
    );
}

function Menu({ onOpen, hostUserId }: { onOpen: (s: Screen) => void; hostUserId: string }) {
    return (
        <div className="flex flex-col">
            <Row label="Identity" onClick={() => onOpen("identity")} />
            <Row label="Chat Appearance" onClick={() => onOpen("appearance")} />
            <Row label="Muted Users" onClick={() => onOpen("muted")} />
            <a
                href={`/popout/chat/${hostUserId}`}
                target="_blank"
                rel="noopener noreferrer"
                // A real window, not a tab — that's the whole point of a pop-out,
                // and target alone would give a tab in every browser.
                onClick={(e) => {
                    e.preventDefault();
                    window.open(
                        `/popout/chat/${hostUserId}`,
                        `wp-chat-${hostUserId}`,
                        "width=420,height=760,menubar=no,toolbar=no,location=no",
                    );
                }}
                className="flex w-full cursor-pointer items-center justify-between rounded-lg px-2 py-3 text-[15px] font-medium text-flexwhite transition-colors hover:bg-white/[0.06]"
            >
                Pop-out Chat
                <HugeiconsIcon icon={LinkSquare02Icon} className="size-4 text-zinc-500" strokeWidth={2.5} />
            </a>
        </div>
    );
}

// ─── Identity ────────────────────────────────────────────────────────────────

const SectionRule = () => <div className="my-4 h-px bg-[rgba(138,145,158,0.2)]" />;

function Identity({ hostUserId }: { hostUserId: string }) {
    const { data: session } = useAuthSession();
    const userId = session?.user?.id ?? "";
    const utils = trpc.useUtils();

    const { data: card } = trpc.profile.card.useQuery({ userId }, { enabled: !!userId });
    // Every badge this user has earned from creators; the one for THIS channel
    // is the "channel badge" the panel talks about.
    const { data: earned } = trpc.creator.getMyBadges.useQuery(undefined, { enabled: !!userId });
    const channelBadge = earned?.find((b) => b.creatorId === hostUserId);

    const setColor = trpc.profile.setChatColor.useMutation({
        onSuccess: () => utils.profile.card.invalidate({ userId }),
        onError: (e) => toast.error(e.message),
    });

    if (!userId) {
        return <p className="px-2 py-8 text-center text-sm font-medium text-zinc-500">Sign in to set your identity</p>;
    }

    const active = resolveChatNameColor(userId, card?.chatColor);
    const name = card?.username ?? card?.name ?? "you";

    return (
        <div>
            <div className="flex items-center justify-between rounded-xl bg-soft-gray-10 px-3 py-3">
                <span className="text-[15px] font-medium text-zinc-400">Preview:</span>
                <span className="text-[15px] font-bold" style={{ color: active }}>{name}</span>
            </div>

            <SectionRule />

            <h3 className="text-[15px] font-bold text-flexwhite">Badges</h3>
            <p className="mt-0.5 text-[13px] font-medium text-zinc-500">
                A maximum of 4 badges can be displayed
            </p>

            <div className="mt-4">
                <p className="text-[13px] font-medium text-zinc-500">Global badges: appear across channels</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                    {card?.badges.length
                        ? card.badges.slice(0, 4).map((b) => <BadgeGlyph key={b.id} id={b.id} className="size-6" />)
                        : <p className="text-[13px] font-medium text-zinc-500">You don&apos;t have any global badges yet</p>}
                </div>
            </div>

            <SectionRule />

            <div>
                <p className="text-[13px] font-medium text-zinc-500">
                    Channel badges: appear on streamer&apos;s channel
                </p>
                {channelBadge ? (
                    <p className="mt-2 text-[13px] font-semibold capitalize text-flexwhite">
                        {channelBadge.tier} · {channelBadge.followMonths} month
                        {channelBadge.followMonths === 1 ? "" : "s"}
                    </p>
                ) : (
                    <p className="mt-2 text-[13px] font-medium text-zinc-500">
                        You don&apos;t have any channel badges yet
                    </p>
                )}
            </div>

            <SectionRule />

            <h3 className="text-[15px] font-bold text-flexwhite">Global name color</h3>
            <p className="mt-0.5 text-[13px] font-medium text-zinc-500">
                Choose a color to display your username in chat
            </p>
            <div className="mt-3 grid grid-cols-6 gap-2">
                {CHAT_NAME_COLORS.map((c) => (
                    <button
                        key={c}
                        type="button"
                        disabled={setColor.isPending}
                        onClick={() => setColor.mutate({ color: c })}
                        aria-label={`name colour ${c}`}
                        aria-pressed={c === active}
                        style={{ backgroundColor: c }}
                        className={cn(
                            "h-9 cursor-pointer rounded-lg transition-transform active:scale-95",
                            c === active && "ring-2 ring-white ring-offset-2 ring-offset-[rgb(5,5,5)]",
                        )}
                    />
                ))}
            </div>
            {card?.chatColor && (
                <button
                    type="button"
                    disabled={setColor.isPending}
                    onClick={() => setColor.mutate({ color: null })}
                    className="mt-3 cursor-pointer text-[13px] font-semibold text-zinc-500 transition-colors hover:text-white"
                >
                    Reset to my default
                </button>
            )}
        </div>
    );
}

// ─── Chat Appearance ─────────────────────────────────────────────────────────

function Toggle({
    label,
    checked,
    onChange,
}: {
    label: string;
    checked: boolean;
    onChange: (v: boolean) => void;
}) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            onClick={() => onChange(!checked)}
            className="flex w-full cursor-pointer items-center justify-between rounded-lg px-2 py-3 text-left transition-colors hover:bg-white/[0.06]"
        >
            <span className="text-[15px] font-medium text-flexwhite">{label}</span>
            <span
                className={cn(
                    "relative h-6 w-10 shrink-0 rounded-full transition-colors",
                    checked ? "bg-white" : "bg-soft-gray-20",
                )}
            >
                <span
                    className={cn(
                        "absolute top-1 size-4 rounded-full transition-all",
                        checked ? "left-5 bg-black" : "left-1 bg-zinc-500",
                    )}
                />
            </span>
        </button>
    );
}

const FONT_SIZES: { value: ChatFontSize; label: string }[] = [
    { value: "sm", label: "Small" },
    { value: "md", label: "Medium" },
    { value: "lg", label: "Large" },
];

function Appearance({ prefs, onPrefs }: { prefs: ChatPrefs; onPrefs: (p: Partial<ChatPrefs>) => void }) {
    return (
        <div>
            <h3 className="px-2 text-[13px] font-medium text-zinc-500">Font size</h3>
            <div className="mt-2 flex gap-1.5 px-2">
                {FONT_SIZES.map((f) => (
                    <button
                        key={f.value}
                        type="button"
                        onClick={() => onPrefs({ fontSize: f.value })}
                        className={cn(
                            "flex-1 cursor-pointer rounded-lg px-3 py-2 font-semibold transition-colors",
                            CHAT_FONT_CLASS[f.value],
                            prefs.fontSize === f.value
                                ? "bg-white text-black"
                                : "bg-soft-gray-10 text-zinc-400 hover:text-white",
                        )}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            <SectionRule />

            <Toggle label="Timestamps" checked={prefs.timestamps} onChange={(v) => onPrefs({ timestamps: v })} />
            <Toggle label="Badges" checked={prefs.badges} onChange={(v) => onPrefs({ badges: v })} />
            <Toggle label="Emotes" checked={prefs.emotes} onChange={(v) => onPrefs({ emotes: v })} />
        </div>
    );
}

// ─── Muted Users ─────────────────────────────────────────────────────────────

function Muted() {
    const utils = trpc.useUtils();
    const { data, isLoading } = trpc.moderation.getMuted.useQuery();
    const unmute = trpc.moderation.unmute.useMutation({
        onSuccess: () => utils.moderation.getMuted.invalidate(),
        onError: (e) => toast.error(e.message),
    });

    if (isLoading) {
        return (
            <div className="flex flex-col gap-2 px-2 pt-2">
                {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-10 rounded-lg bg-soft-gray-10" />
                ))}
            </div>
        );
    }

    if (!data?.length) {
        return <p className="px-2 py-8 text-center text-sm font-medium text-zinc-500">You haven&apos;t muted anyone</p>;
    }

    return (
        <div className="flex flex-col">
            {data.map((m) => (
                <div key={m.id} className="flex items-center justify-between rounded-lg px-2 py-2.5">
                    <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-flexwhite">
                        {m.username ?? m.name}
                    </span>
                    {/* getMuted selects user.id as `id` — the muted USER, not
                        the mute row — which is what unmute takes. */}
                    <button
                        type="button"
                        disabled={unmute.isPending}
                        onClick={() => unmute.mutate({ userId: m.id })}
                        className="shrink-0 cursor-pointer text-[13px] font-bold text-zinc-500 transition-colors hover:text-white"
                    >
                        Unmute
                    </button>
                </div>
            ))}
        </div>
    );
}
