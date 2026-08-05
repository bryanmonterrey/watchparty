"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon, LinkSquare02Icon } from "@hugeicons/core-free-icons";
import { ChatSheet } from "./chat-sheet";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { BadgeGlyph } from "@/components/profile/badge-glyphs";
import { CHAT_NAME_COLORS, resolveChatNameColor } from "@/lib/chat/chat-name-color";
import { CHAT_FONT_CLASS, type ChatFontSize, type ChatPrefs } from "@/hooks/use-chat-prefs";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// Chat Settings, as a card above the composer rather than a dialog (chrome and
// sizing live in chat-sheet.tsx).
//
// It's a drill-down stack, which is why Identity has a back chevron AND a close
// — the shield beside the composer opens Identity directly, and back returns to
// the menu it was never on. One `screen` state serves both entry points.
//
// Pop-out is a link, not a screen: it opens /popout/chat/<userId>, a bare route
// with no app chrome, sized for a second monitor.

type Screen = "menu" | "identity" | "appearance" | "muted" | "mode";

export function ChatSettings({
    hostUserId,
    initialScreen = "menu",
    canModerate = false,
    prefs,
    onPrefs,
    onClose,
}: {
    hostUserId: string;
    initialScreen?: Screen;
    /** Unlocks the Chat Mode row — host and moderators only. */
    canModerate?: boolean;
    prefs: ChatPrefs;
    onPrefs: (patch: Partial<ChatPrefs>) => void;
    onClose: () => void;
}) {
    const [screen, setScreen] = useState<Screen>(initialScreen);

    const title =
        screen === "identity" ? "Identity"
            : screen === "appearance" ? "Chat Appearance"
                : screen === "muted" ? "Muted Users"
                    : screen === "mode" ? "Chat Mode"
                        : "Chat Settings";

    return (
        <ChatSheet
            title={title}
            onBack={screen === "menu" ? undefined : () => setScreen("menu")}
            onClose={onClose}
        >
            {screen === "menu" && <Menu onOpen={setScreen} hostUserId={hostUserId} canModerate={canModerate} />}
            {screen === "identity" && <Identity hostUserId={hostUserId} />}
            {screen === "appearance" && <Appearance prefs={prefs} onPrefs={onPrefs} />}
            {screen === "muted" && <Muted />}
            {screen === "mode" && <Mode hostUserId={hostUserId} />}
        </ChatSheet>
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

function Menu({ onOpen, hostUserId, canModerate }: {
    onOpen: (s: Screen) => void;
    hostUserId: string;
    canModerate: boolean;
}) {
    return (
        <div className="flex flex-col">
            <Row label="Identity" onClick={() => onOpen("identity")} />
            {/* Only for people who can actually change it — a row that always
                403s is worse than an absent one. */}
            {canModerate && <Row label="Chat Mode" onClick={() => onOpen("mode")} />}
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

// ─── Chat Mode ───────────────────────────────────────────────────────────────

const MODES = [
    { value: "everyone", label: "Everyone", hint: "Anyone signed in can chat" },
    { value: "followers", label: "Followers", hint: "Only people who follow the channel" },
    { value: "subscribers", label: "Subscribers", hint: "Only active subscribers" },
] as const;

/** Wait options, in minutes. The gate caps at a day (see setChatMode). */
const WAITS = [
    { value: 0, label: "None" },
    { value: 10, label: "10 min" },
    { value: 60, label: "1 hour" },
    { value: 1440, label: "1 day" },
];

function Mode({ hostUserId }: { hostUserId: string }) {
    const utils = trpc.useUtils();
    const { data, isLoading } = trpc.stream.chatGate.useQuery({ creatorId: hostUserId });

    const save = trpc.stream.setChatMode.useMutation({
        onSuccess: () => {
            utils.stream.chatGate.invalidate({ creatorId: hostUserId });
            toast.success("Chat mode updated");
        },
        onError: (e) => toast.error(e.message),
    });

    if (isLoading || !data) {
        return (
            <div className="flex flex-col gap-1.5 py-1">
                {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-11 rounded-lg bg-soft-gray-10" />)}
            </div>
        );
    }

    const set = (mode: typeof MODES[number]["value"], followerMinutes: number) =>
        save.mutate({ creatorId: hostUserId, mode, followerMinutes });

    return (
        <div>
            <p className="pb-2 text-[13px] font-medium text-zinc-500">Who can chat</p>
            {MODES.map((m) => (
                <button
                    key={m.value}
                    type="button"
                    disabled={save.isPending}
                    onClick={() => set(m.value, data.followerMinutes)}
                    className={cn(
                        "flex w-full cursor-pointer flex-col items-start rounded-lg px-2 py-2.5 text-left transition-colors",
                        data.mode === m.value ? "bg-white/[0.08]" : "hover:bg-white/[0.06]",
                    )}
                >
                    <span className={cn("text-[15px] font-bold", data.mode === m.value ? "text-flexwhite" : "text-zinc-300")}>
                        {m.label}
                    </span>
                    <span className="text-[13px] font-medium text-zinc-500">{m.hint}</span>
                </button>
            ))}

            {/* Only meaningful for followers mode — a subscriber's wait is their
                billing date, and "everyone" has nothing to wait for. */}
            {data.mode === "followers" && (
                <>
                    <SectionRule />
                    <p className="pb-2 text-[13px] font-medium text-zinc-500">
                        Wait before a new follower&apos;s first message
                    </p>
                    <div className="flex gap-1.5">
                        {WAITS.map((w) => (
                            <button
                                key={w.value}
                                type="button"
                                disabled={save.isPending}
                                onClick={() => set("followers", w.value)}
                                className={cn(
                                    "flex-1 cursor-pointer rounded-lg px-2 py-2 text-[13px] font-bold transition-colors",
                                    data.followerMinutes === w.value
                                        ? "bg-white text-black"
                                        : "bg-soft-gray-10 text-zinc-400 hover:text-white",
                                )}
                            >
                                {w.label}
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
