"use client";

import { useEffect, useRef, useState } from "react";
import { useCashtagField } from "@/components/browse/use-cashtag-field";
import { CashtagAutocomplete } from "@/components/browse/cashtag-autocomplete";
import { HugeiconsIcon } from "@hugeicons/react";
import {
    ArrowDown01Icon,
    Copy01Icon,
    Key01Icon,
    Link01Icon,
    LiveStreaming02Icon,
    Tick02Icon,
} from "@hugeicons/core-free-icons";
import { trpc } from "@/lib/trpc/client";
import { TokenLaunchTrigger, TokenLaunchState, DEFAULT_TOKEN_LAUNCH } from "@/components/browse/token-launch";
import { TickerEditDialog } from "@/components/browse/ticker-edit-dialog";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Squircle } from "@/components/ui/squircle";
import { appToast } from "@/components/app-ui/app-toast";

// The Create dialog's Stream tab. Friendly product moment, not a settings
// form: status hero, two big copy cards (the key is copy-only — never shown
// on screen), title + category pills that save themselves, OBS steps behind
// a collapsible. Flat fills + hairlines only.

type Protocol = "RTMP" | "WHIP";

const PROTOCOLS: { key: Protocol; label: string; hint: string }[] = [
    { key: "RTMP", label: "RTMP", hint: "OBS, Streamlabs & most encoders" },
    { key: "WHIP", label: "WHIP", hint: "Browser encoders, ultra-low latency" },
];

const CATEGORIES = ["Gaming", "Music", "Crypto", "IRL", "Just chatting", "Sports", "Art"];

export function StreamSetup() {
    const utils = trpc.useUtils();
    const { data: stream, isLoading } = trpc.stream.getMine.useQuery();

    const generate = trpc.stream.generateConnection.useMutation({
        onSuccess: () => {
            utils.stream.getMine.invalidate();
            appToast.success("Stream connection ready");
        },
        onError: (e) => appToast.error(e.message),
    });

    if (isLoading) {
        return (
            <div className="flex h-[420px] items-center justify-center">
                <div className="h-3.5 w-40 overflow-hidden rounded-full"><div className="size-full shimmer-skeleton" /></div>
            </div>
        );
    }

    return stream?.streamKey ? (
        <Connected stream={stream} onSwitchProtocol={(p) => generate.mutate({ ingressType: p })} switching={generate.isPending} />
    ) : (
        <FirstRun onGenerate={(p) => generate.mutate({ ingressType: p })} generating={generate.isPending} />
    );
}

// ─── First run: no connection yet ───────────────────────────

function FirstRun({ onGenerate, generating }: { onGenerate: (p: Protocol) => void; generating: boolean }) {
    const [protocol, setProtocol] = useState<Protocol>("RTMP");
    const active = PROTOCOLS.find((p) => p.key === protocol)!;

    return (
        <div className="mx-auto flex min-h-[420px] max-w-sm flex-col items-center justify-center px-2 py-10 text-center">
            <div className="grid size-16 place-items-center rounded-full bg-pastelred/10">
                <HugeiconsIcon icon={LiveStreaming02Icon} className="size-8 text-pastelred" strokeWidth={1.8} />
            </div>

            <h2 className="mt-5 text-[26px] font-black tracking-tight text-white">Go live on watchparty</h2>
            <p className="mt-2 text-[14px] font-medium leading-relaxed text-zinc-500">
                Generate your stream connection once, then stream from OBS or any encoder — whenever you want.
            </p>

            {/* Protocol choice — segmented pill, white puck marks the active side */}
            <div className="mt-7 inline-flex rounded-full bg-white/[0.06] p-1">
                {PROTOCOLS.map((p) => (
                    <button
                        key={p.key}
                        onClick={() => setProtocol(p.key)}
                        className={cn(
                            "cursor-pointer rounded-full px-6 py-2 text-[14px] font-bold transition-colors",
                            protocol === p.key ? "bg-white text-black" : "text-zinc-400 hover:text-white",
                        )}
                    >
                        {p.label}
                    </button>
                ))}
            </div>
            <p className="mt-2 text-[12px] font-semibold text-zinc-600">{active.hint}</p>

            <button
                onClick={() => onGenerate(protocol)}
                disabled={generating}
                className="mt-7 h-12 w-full cursor-pointer rounded-full bg-white text-[15px] font-extrabold text-black transition-colors hover:bg-white/90 disabled:opacity-50"
            >
                {generating ? "Setting up your channel…" : "Generate stream connection"}
            </button>
            <p className="mt-3 text-[12px] font-medium text-zinc-600">
                Free · takes a few seconds · your key stays private
            </p>
        </div>
    );
}

// ─── Connected ───────────────────────────────────────────────

function Connected({
    stream,
    onSwitchProtocol,
    switching,
}: {
    stream: {
        serverUrl: string | null;
        streamKey: string | null;
        playbackUrl: string | null;
        isLive: boolean | null;
        title: string | null;
        category: string | null;
        ticker?: string | null;
    };
    onSwitchProtocol: (p: Protocol) => void;
    switching: boolean;
}) {
    const protocol: Protocol = stream.serverUrl?.startsWith("https") ? "WHIP" : "RTMP";
    const other: Protocol = protocol === "RTMP" ? "WHIP" : "RTMP";

    return (
        <div className="mx-auto max-w-md px-2 pb-3">
            {/* Status hero */}
            <div className="flex flex-col items-center pt-4 text-center">
                <div className="relative grid size-16 place-items-center rounded-full bg-pastelred/10">
                    {stream.isLive && (
                        <span className="absolute inset-0 animate-ping rounded-full bg-pastelred/20" />
                    )}
                    <HugeiconsIcon icon={LiveStreaming02Icon} className="size-8 text-pastelred" strokeWidth={1.8} />
                </div>
                <h2 className="mt-4 text-[24px] font-black tracking-tight text-white">
                    {stream.isLive ? "You're live!" : "You're ready to stream"}
                </h2>
                <p className="mt-1 text-[14px] font-medium text-zinc-500">
                    {stream.isLive
                        ? "Your channel is broadcasting right now."
                        : "Copy your details into OBS and hit Start Streaming."}
                </p>
            </div>

            {/* Big copy cards — the whole card is the button */}
            <div className="mt-6 grid grid-cols-2 gap-3">
                <CopyCard icon={Link01Icon} label="Server URL" value={stream.serverUrl} hint="Paste into “Server”" />
                <CopyCard icon={Key01Icon} label="Stream key" value={stream.streamKey} hint="Secret — copy only" accent />
            </div>

            {/* Stream info — saves itself */}
            <StreamInfo title={stream.title} category={stream.category} ticker={stream.ticker} />

            <StartBroadcast stream={stream} />

            {/* How to go live — tucked away once you've seen it */}
            <ObsSteps />

            {/* Quiet plumbing row */}
            <div className="mt-4 flex items-center justify-between px-1 text-[12px] font-semibold text-zinc-600">
                <button
                    onClick={() => onSwitchProtocol(other)}
                    disabled={switching}
                    className="cursor-pointer transition-colors hover:text-zinc-300 disabled:opacity-50"
                >
                    {switching ? "Switching…" : `Using ${protocol} — switch to ${other}`}
                </button>
                {stream.playbackUrl && (
                    <button
                        onClick={() => {
                            navigator.clipboard.writeText(stream.playbackUrl!);
                            appToast.success("Playback URL copied");
                        }}
                        className="cursor-pointer transition-colors hover:text-zinc-300"
                    >
                        Copy playback URL
                    </button>
                )}
            </div>
        </div>
    );
}

function CopyCard({
    icon,
    label,
    value,
    hint,
    accent,
}: {
    icon: typeof Link01Icon;
    label: string;
    value: string | null;
    hint: string;
    accent?: boolean;
}) {
    const [copied, setCopied] = useState(false);

    const copy = () => {
        if (!value) return;
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <Squircle asChild radius={22}>
            <button
                onClick={copy}
                disabled={!value}
                className={cn(
                    "group flex cursor-pointer flex-col items-start gap-3 p-4 text-left transition-colors disabled:opacity-40",
                    accent ? "bg-pastelred/[0.08] hover:bg-pastelred/[0.13]" : "bg-white/[0.04] hover:bg-white/[0.08]",
                )}
            >
                <span
                    className={cn(
                        "grid size-9 place-items-center rounded-full",
                        accent ? "bg-pastelred/15 text-pastelred" : "bg-white/[0.07] text-zinc-300",
                    )}
                >
                    <HugeiconsIcon icon={copied ? Tick02Icon : icon} className={cn("size-4.5", copied && "text-lantern")} strokeWidth={2} />
                </span>
                <span className="min-w-0">
                    <span className="block text-[14px] font-bold text-white">{label}</span>
                    <span className={cn("mt-0.5 block text-[12px] font-semibold", copied ? "text-lantern" : "text-zinc-500")}>
                        {copied ? "Copied!" : hint}
                    </span>
                </span>
                <span className="flex items-center gap-1 text-[12px] font-bold text-zinc-400 transition-colors group-hover:text-white">
                    <HugeiconsIcon icon={Copy01Icon} className="size-3.5" strokeWidth={2.5} />
                    Copy
                </span>
            </button>
        </Squircle>
    );
}

// The commit step: everything that must be true BEFORE frames arrive.
//
// It does NOT push video — ingest is RTMP, so the stream actually begins when
// OBS connects and the IVS webhook flips isLive. What this button owns is the
// coin: it's minted here from the ticker chosen above, rather than when that
// ticker was typed, so a stream configured and never started leaves no draft
// coin behind.
//
// Disabled without a title because the mutation requires one, and a button that
// only fails is worse than a button that waits.
function StartBroadcast({ stream }: { stream: { title: string | null; ticker?: string | null; isLive: boolean | null } }) {
    const utils = trpc.useUtils();
    const start = trpc.stream.startBroadcast.useMutation({
        onSuccess: (r) => {
            utils.stream.getMine.invalidate();
            appToast.success(r.created ? "broadcast started — your coin is live as a draft" : "broadcast started");
        },
        onError: (e) => appToast.error(e.message),
    });

    if (stream.isLive) return null;

    const ready = !!stream.title?.trim();
    return (
        <div className="mt-6">
            <button
                onClick={() => start.mutate()}
                disabled={!ready || start.isPending}
                className={cn(
                    "h-12 w-full cursor-pointer rounded-full text-[15px] font-bold transition-colors",
                    "bg-pastelred text-black hover:bg-pastelred/90",
                    "disabled:cursor-not-allowed disabled:opacity-40",
                )}
            >
                {start.isPending ? "Starting…" : "Start broadcast"}
            </button>
            <p className="mt-2 text-center text-[12px] font-medium text-zinc-500">
                {!ready
                    ? "Add a title first"
                    : stream.ticker
                        ? `Creates $${stream.ticker.toUpperCase()}, then connect OBS to go live`
                        : "Then connect OBS to go live"}
            </p>
        </div>
    );
}

// Title + category save themselves (blur/Enter for the title, click for a
// pill) — a transient "Saved" flash instead of a Save button.
function StreamInfo({ title: savedTitle, category: savedCategory, ticker: savedTicker }: { title: string | null; category: string | null; ticker?: string | null }) {
    const utils = trpc.useUtils();
    const [title, setTitle] = useState(savedTitle ?? "");
    const [savedFlash, setSavedFlash] = useState(false);
    // Going live makes a post; a ticker typed here tags the coin on it.
    const titleTags = useCashtagField(title, setTitle);
    const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const updateInfo = trpc.stream.updateInfo.useMutation({
        onSuccess: () => {
            utils.stream.getMine.invalidate();
            setSavedFlash(true);
            if (flashTimer.current) clearTimeout(flashTimer.current);
            flashTimer.current = setTimeout(() => setSavedFlash(false), 2000);
        },
        onError: (e) => appToast.error(e.message),
    });
    useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);

    // Tags ride along with the title, and that is what makes the picker real.
    // They can't be sent at go-live instead: "Start broadcast" lives in a
    // SIBLING component, and `picked` is client-only state that never rebuilds
    // itself from existing text — so a reload between setup and going live
    // leaves the title still reading "$TICKER" with nothing behind it. Saved
    // here, `startBroadcast` reads them off the stream row.
    const saveTitle = () => {
        if (title.trim() === (savedTitle ?? "")) return;
        updateInfo.mutate({
            title: title.trim() || undefined,
            // `tagsIn`, not `picked` — it drops coins the author picked and
            // then deleted from the text.
            tags: titleTags.tagsIn(title),
        });
    };

    // The stream's coin. Set BEFORE going live, and saved as intent only — the
    // coin is created when the broadcast starts, so configuring a ticker and
    // then never streaming leaves no orphan draft behind.
    //
    // ANYONE can launch a stream's coin, same as a post's: the first buy IS the
    // launch. That's the opposite of a creator coin, which only its creator may
    // launch — a distinction that has to be enforced server-side, not here.
    const [tokenLaunch, setTokenLaunch] = useState<TokenLaunchState>({
        ...DEFAULT_TOKEN_LAUNCH,
        earningsEnabled: false,
        ticker: savedTicker ?? "",
    });
    const [isEditingTicker, setIsEditingTicker] = useState(false);

    const saveTicker = (next: TokenLaunchState) => {
        setTokenLaunch(next);
        if ((next.ticker ?? "") !== (savedTicker ?? "")) {
            updateInfo.mutate({ ticker: next.ticker || "" });
        }
    };

    return (
        <div className="mt-6">
            <div className="flex items-center justify-between px-1">
                <p className="text-[13px] font-bold text-zinc-400">Stream info</p>
                <span
                    className={cn(
                        "flex items-center gap-1 text-[12px] font-bold text-lantern transition-opacity",
                        savedFlash ? "opacity-100" : "opacity-0",
                    )}
                >
                    <HugeiconsIcon icon={Tick02Icon} className="size-3.5" strokeWidth={2.5} />
                    Saved
                </span>
            </div>
            {/* Going live creates a post, so `$TICKER` in the title tags the
                coin exactly as it would from the composer. `relative` is the
                menu's positioning context; without it the panel anchors to
                whatever ancestor happens to be positioned. */}
            <div className="relative">
                <Input
                    {...titleTags.inputProps}
                    ref={titleTags.ref as React.RefObject<HTMLInputElement>}
                    radius={16}
                    value={title}
                    onBlur={saveTitle}
                    // Enter belongs to the MENU while it is open — blurring
                    // would close the panel and lose the caret the replacement
                    // needs, so the field only blurs when nothing is open.
                    onKeyDown={(e) => {
                        if (titleTags.open && titleTags.keyHandler.current?.(e)) {
                            e.preventDefault();
                            return;
                        }
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
                    placeholder="What are you streaming today?"
                    maxLength={100}
                    className="mt-2 h-12 bg-white/[0.04] text-[14px] font-medium"
                />
                {titleTags.open && (
                    <CashtagAutocomplete
                        top={56}
                        query={titleTags.query}
                        onSelect={titleTags.select}
                        onClose={titleTags.close}
                        registerKeyHandler={(h) => { titleTags.keyHandler.current = h; }}
                    />
                )}
            </div>
            <div className="mt-3 flex items-center gap-2">
                <p className="text-[13px] font-bold text-zinc-400">Coin</p>
                <TokenLaunchTrigger
                    state={tokenLaunch}
                    onClick={() => setIsEditingTicker(true)}
                    className="h-11"
                    onClear={() => saveTicker({ ...tokenLaunch, ticker: "", isTickerManuallyEdited: true })}
                />
            </div>

            <TickerEditDialog
                open={isEditingTicker}
                onOpenChange={setIsEditingTicker}
                state={tokenLaunch}
                onSave={(updates) => saveTicker({ ...tokenLaunch, ...updates })}
            />

            <div className="mt-2.5 flex flex-wrap gap-1.5">
                {CATEGORIES.map((c) => {
                    const active = (savedCategory ?? "") === c;
                    return (
                        <button
                            key={c}
                            onClick={() => updateInfo.mutate({ category: active ? "" : c })}
                            disabled={updateInfo.isPending}
                            className={cn(
                                "cursor-pointer rounded-full px-3.5 py-1.5 text-[12px] font-bold transition-colors",
                                active ? "bg-white text-black" : "bg-white/[0.06] text-zinc-400 hover:text-white",
                            )}
                        >
                            {c}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function ObsSteps() {
    const [open, setOpen] = useState(false);

    return (
        <div className="mt-5">
            <Squircle asChild radius={18}>
                <button
                    onClick={() => setOpen((v) => !v)}
                    className="flex w-full cursor-pointer items-center justify-between bg-white/[0.03] px-4 py-3.5 text-left transition-colors hover:bg-white/[0.05]"
                >
                    <span className="text-[14px] font-bold text-white">How to go live in OBS</span>
                    <HugeiconsIcon
                        icon={ArrowDown01Icon}
                        className={cn("size-4 text-zinc-500 transition-transform duration-200", open && "rotate-180")}
                        strokeWidth={2.5}
                    />
                </button>
            </Squircle>
            {open && (
                <div className="space-y-2.5 px-4 pb-1 pt-3">
                    {[
                        "Settings → Stream → set Service to “Custom…”",
                        "Paste the Server URL and Stream key",
                        "Start Streaming — your channel flips live here automatically",
                    ].map((step, i) => (
                        <div key={i} className="flex items-start gap-2.5">
                            <span className="mt-px grid size-5 shrink-0 place-items-center rounded-full bg-white/[0.06] text-[11px] font-black text-zinc-400">
                                {i + 1}
                            </span>
                            <p className="text-[13px] font-medium leading-snug text-zinc-500">{step}</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
