import { HugeiconsIcon } from "@hugeicons/react";
import {
    LiveStreaming01Icon, Comment01Icon, FavouriteIcon, CheckmarkBadge01Icon,
    PlayIcon, DollarCircleIcon, RepeatIcon, Image01Icon,
    ShieldKeyIcon, ArrowUp01Icon, ArrowDown01Icon,
    Mic01Icon, SecurityLockIcon, SentIcon, UserGroupIcon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

// Branded product-UI mockups for the marketing panels. These are REAL mini
// component previews (not fake screenshots) — styled like the app, with sample
// data, so the marketing panels are content-filled and varied per page instead
// of empty placeholder frames. Brand: pastels + lantern/pastelred/twitter
// accents, aggressive rounding, no gradients.

// A clean phone frame to hold a screen mock.
export function PhoneMock({ children, className }: { children: React.ReactNode; className?: string }) {
    return (
        <div className={cn("mx-auto w-[260px] shrink-0 rounded-[2.5rem] bg-black p-2.5 shadow-[0_1px_0_rgba(255,255,255,0.4)_inset]", className)}>
            <div className="relative overflow-hidden rounded-[2rem] bg-white">
                {/* notch */}
                <div className="absolute left-1/2 top-2 z-10 h-5 w-20 -translate-x-1/2 rounded-full bg-black" />
                {children}
            </div>
        </div>
    );
}

function Avatar({ className }: { className?: string }) {
    return <span className={cn("block rounded-full", className)} />;
}

// Creator profile screen — avatar, verified handle, stats, live pill, earnings.
export function CreatorScreen() {
    return (
        <div className="px-4 pb-5 pt-9 text-black">
            <div className="flex items-center gap-3">
                <Avatar className="size-14 bg-pastelred ring-2 ring-white" />
                <div className="min-w-0">
                    <div className="flex items-center gap-1">
                        <span className="text-[15px] font-extrabold tracking-tight">midnight</span>
                        <HugeiconsIcon icon={CheckmarkBadge01Icon} size={15} className="text-twitter" />
                    </div>
                    <p className="text-xs font-semibold text-black/45">@midnight</p>
                </div>
                <span className="ml-auto rounded-full bg-black px-3 py-1.5 text-[11px] font-bold text-white">Follow</span>
            </div>

            <div className="mt-4 grid grid-cols-3 overflow-hidden rounded-2xl bg-soft-gray text-center">
                {[["12.4K", "Followers"], ["3.1M", "Views"], ["$8,240", "Earned"]].map(([n, l]) => (
                    <div key={l} className="px-2 py-3">
                        <p className="text-sm font-extrabold tracking-tight">{n}</p>
                        <p className="text-[10px] font-semibold text-black/45">{l}</p>
                    </div>
                ))}
            </div>

            <div className="mt-3 flex items-center gap-2 rounded-2xl bg-pastelred/10 p-3">
                <span className="flex items-center gap-1 rounded-md bg-red2 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
                    <HugeiconsIcon icon={LiveStreaming01Icon} size={11} /> Live
                </span>
                <span className="truncate text-xs font-bold">Friday night freestyle</span>
                <span className="ml-auto text-[10px] font-semibold text-black/45">1.2K</span>
            </div>

            <div className="mt-3 rounded-2xl bg-lantern/15 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-black/45">This month</p>
                <p className="mt-0.5 text-2xl font-extrabold tracking-tight text-black">$2,180.50</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/10">
                    <div className="h-full w-3/4 rounded-full bg-lantern" />
                </div>
            </div>
        </div>
    );
}

// Live stream screen — player with LIVE badge, chat lines.
export function LiveScreen() {
    return (
        <div className="text-black">
            <div className="relative aspect-[4/5] bg-gray1">
                <div className="absolute inset-0 grid place-items-center">
                    <span className="grid size-12 place-items-center rounded-full bg-white/90">
                        <HugeiconsIcon icon={PlayIcon} size={22} className="text-black" />
                    </span>
                </div>
                <span className="absolute left-3 top-9 flex items-center gap-1 rounded-md bg-red2 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
                    <HugeiconsIcon icon={LiveStreaming01Icon} size={11} /> Live
                </span>
                <span className="absolute right-3 top-9 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-bold text-white">3.4K</span>
            </div>
            <div className="space-y-2 p-3">
                {[["taylor", "this is fire 🔥", "bg-twitter"], ["wave", "lfg!!", "bg-lantern"], ["nova", "gm everyone", "bg-sunset"]].map(([u, m, c]) => (
                    <div key={u} className="flex items-center gap-2">
                        <Avatar className={cn("size-5", c)} />
                        <span className="text-[11px] font-bold">{u}</span>
                        <span className="truncate text-[11px] font-semibold text-black/55">{m}</span>
                    </div>
                ))}
                <div className="mt-1 flex items-center gap-2 rounded-full bg-soft-gray px-3 py-2 text-[11px] font-semibold text-black/40">
                    Say something…
                    <span className="ml-auto flex gap-2">
                        <HugeiconsIcon icon={FavouriteIcon} size={14} className="text-pastelred" />
                        <HugeiconsIcon icon={Comment01Icon} size={14} className="text-black/40" />
                    </span>
                </div>
            </div>
        </div>
    );
}

// Feed / timeline screen — tabs, a post with media, a live tile.
export function FeedScreen() {
    return (
        <div className="pt-9 text-black">
            <div className="flex gap-5 border-b border-black/10 px-4 pb-2 text-xs font-bold">
                <span className="border-b-2 border-black pb-1.5">For you</span>
                <span className="pb-1.5 text-black/40">Following</span>
                <span className="pb-1.5 text-black/40">Live</span>
            </div>
            <div className="px-4 py-3">
                <div className="flex items-center gap-2">
                    <Avatar className="size-7 bg-twitter" />
                    <span className="text-xs font-extrabold">wave</span>
                    <HugeiconsIcon icon={CheckmarkBadge01Icon} size={12} className="text-twitter" />
                    <span className="text-[11px] font-semibold text-black/40">@wave · 2h</span>
                </div>
                <p className="mt-2 text-xs font-semibold leading-snug">just dropped the new set, link in bio 🎧</p>
                <div className="mt-2 flex aspect-[16/10] items-center justify-center rounded-xl bg-soft-blue">
                    <HugeiconsIcon icon={Image01Icon} size={26} className="text-black/20" />
                </div>
                <div className="mt-2 flex items-center gap-5 text-black/40">
                    <span className="flex items-center gap-1 text-[11px] font-semibold"><HugeiconsIcon icon={FavouriteIcon} size={14} className="text-pastelred" /> 842</span>
                    <span className="flex items-center gap-1 text-[11px] font-semibold"><HugeiconsIcon icon={Comment01Icon} size={14} /> 96</span>
                    <span className="flex items-center gap-1 text-[11px] font-semibold"><HugeiconsIcon icon={RepeatIcon} size={14} /> 31</span>
                </div>
            </div>
            <div className="mx-4 mb-4 flex items-center gap-2 rounded-2xl bg-pastelred/10 p-2.5">
                <span className="flex items-center gap-1 rounded-md bg-red2 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
                    <HugeiconsIcon icon={LiveStreaming01Icon} size={11} /> Live
                </span>
                <span className="truncate text-[11px] font-bold">GTA VI release stream</span>
                <span className="ml-auto text-[10px] font-semibold text-black/45">5.1K</span>
            </div>
        </div>
    );
}

// Token / coin screen — price, chart, buy/sell.
export function CoinScreen() {
    return (
        <div className="px-4 pb-5 pt-9 text-black">
            <div className="flex items-center gap-2">
                <Avatar className="size-9 bg-sunset" />
                <div>
                    <p className="text-sm font-extrabold tracking-tight">$WAVE</p>
                    <p className="text-[10px] font-semibold text-black/45">Wave Coin</p>
                </div>
                <span className="ml-auto rounded-full bg-lantern/20 px-2 py-0.5 text-[10px] font-bold text-jewel">+18.4%</span>
            </div>
            <p className="mt-3 text-2xl font-extrabold tracking-tight">$0.0428</p>
            <svg viewBox="0 0 200 70" className="mt-2 h-20 w-full" preserveAspectRatio="none">
                <polyline points="0,55 25,48 50,52 75,38 100,42 125,28 150,30 175,16 200,10" fill="none" stroke="var(--color-lantern)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-full bg-lantern py-2.5 text-center text-xs font-bold text-black">Buy</div>
                <div className="rounded-full bg-black py-2.5 text-center text-xs font-bold text-white">Sell</div>
            </div>
            <div className="mt-3 flex items-center justify-between rounded-2xl bg-soft-gray px-3 py-2.5 text-[11px]">
                <span className="font-semibold text-black/50">Market cap</span>
                <span className="font-extrabold">$1.2M</span>
            </div>
        </div>
    );
}

// Wallet / security screen — balance, tokens, Swig shield.
export function WalletScreen() {
    return (
        <div className="px-4 pb-5 pt-9 text-black">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-black/45">Total balance</p>
            <p className="mt-0.5 text-3xl font-extrabold tracking-tight">$4,920.18</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="flex items-center justify-center gap-1 rounded-full bg-black py-2.5 text-xs font-bold text-white">
                    <HugeiconsIcon icon={ArrowUp01Icon} size={14} /> Send
                </div>
                <div className="flex items-center justify-center gap-1 rounded-full bg-soft-gray py-2.5 text-xs font-bold">
                    <HugeiconsIcon icon={ArrowDown01Icon} size={14} /> Receive
                </div>
            </div>
            <div className="mt-3 space-y-2">
                {[["SOL", "Solana", "$3,180.00", "bg-twitter"], ["USDC", "USD Coin", "$1,740.18", "bg-lantern"]].map(([t, n, v, c]) => (
                    <div key={t} className="flex items-center gap-2 rounded-2xl bg-soft-gray px-3 py-2.5">
                        <Avatar className={cn("size-7", c)} />
                        <div>
                            <p className="text-xs font-extrabold">{t}</p>
                            <p className="text-[10px] font-semibold text-black/45">{n}</p>
                        </div>
                        <span className="ml-auto text-xs font-extrabold">{v}</span>
                    </div>
                ))}
            </div>
            <div className="mt-3 flex items-center gap-2 rounded-2xl bg-twitter/10 px-3 py-2.5">
                <HugeiconsIcon icon={ShieldKeyIcon} size={18} className="text-twitter" strokeWidth={1.8} />
                <span className="text-[11px] font-bold">Secured by Swig</span>
                <span className="ml-auto text-[10px] font-semibold text-black/45">No seed phrase</span>
            </div>
        </div>
    );
}

// Phantom-style "stacked paper" card: a large portrait card with pastel sheets
// fanned behind it for depth (no drop shadow — the offset sheets + inset
// highlight do the work). Holds a title and an art/content block. Sized big and
// meant to stand ALONE, centered on a colored band (see CenterFeature).
export function StackedCard({
    title,
    art,
    tone = "bg-white",
    sheets = ["bg-soft-pink", "bg-soft-blue"],
    className,
}: {
    title?: React.ReactNode;
    art?: React.ReactNode;
    tone?: string;
    sheets?: string[];
    className?: string;
}) {
    return (
        <div className={cn("relative mx-auto w-[280px] sm:w-[330px]", className)}>
            {sheets.map((s, i) => (
                <div
                    key={i}
                    className={cn("absolute inset-0 rounded-[30px] ring-1 ring-black/[0.04]", s)}
                    style={{ transform: `translate(${(i + 1) * 12}px, ${(i + 1) * 6}px)` }}
                />
            ))}
            <div
                className={cn(
                    "relative flex aspect-[3/4] flex-col overflow-hidden rounded-[30px] p-6 ring-1 ring-black/[0.05] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]",
                    tone,
                )}
            >
                {title && <p className="text-[17px] font-extrabold leading-snug tracking-tight text-black">{title}</p>}
                {art}
            </div>
        </div>
    );
}

// Abstract brand-pastel "art" block to fill a StackedCard — overlapping circles
// on black, echoing Phantom's colorful card art but in watchparty colors.
export function BlobArt({ className }: { className?: string }) {
    return (
        <div className={cn("relative mt-4 flex-1 overflow-hidden rounded-2xl bg-black", className)}>
            <span className="absolute -left-5 top-6 size-24 rounded-full bg-twitter" />
            <span className="absolute right-1 top-1 size-16 rounded-full bg-sunset" />
            <span className="absolute -bottom-4 left-10 size-28 rounded-full bg-lantern" />
            <span className="absolute bottom-5 right-5 size-12 rounded-full bg-pastelred" />
            <span className="absolute left-1/2 top-1/2 size-9 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white ring-4 ring-black/20" />
        </div>
    );
}

// ---- Hero visuals: a DISTINCT composition per marketing page, so no two
// heroes share the same "tilted phone in a pastel box" shape. Each is
// self-contained and sized to fill a hero column / centered slot. ----

// LIVE — a wide 16:9 player card with a floating live-chat card overlapping it.
export function HeroLandscape({ className }: { className?: string }) {
    return (
        <div className={cn("relative mx-auto w-full max-w-[500px]", className)}>
            <div className="relative aspect-video overflow-hidden rounded-[28px] bg-gray1 ring-1 ring-black/[0.05] shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]">
                <span className="absolute left-4 top-4 flex items-center gap-1 rounded-lg bg-red2 px-2 py-1 text-[11px] font-bold uppercase text-white">
                    <HugeiconsIcon icon={LiveStreaming01Icon} size={12} /> Live
                </span>
                <span className="absolute right-4 top-4 rounded-lg bg-black/55 px-2 py-1 text-[11px] font-bold text-white">3.4K watching</span>
                <div className="absolute inset-0 grid place-items-center">
                    <span className="grid size-16 place-items-center rounded-full bg-white/90 ring-1 ring-black/5">
                        <HugeiconsIcon icon={PlayIcon} size={28} className="text-black" />
                    </span>
                </div>
            </div>
            <div className="absolute -bottom-6 right-2 hidden w-[210px] rounded-2xl bg-white p-3 ring-1 ring-black/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] sm:block">
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-black/40">Live chat</p>
                {([["taylor", "this is fire 🔥", "bg-twitter"], ["nova", "gm everyone", "bg-sunset"]] as const).map(([u, m, c]) => (
                    <div key={u} className="flex items-center gap-2 py-0.5">
                        <span className={cn("size-5 rounded-full", c)} />
                        <span className="text-[11px] font-bold">{u}</span>
                        <span className="truncate text-[11px] font-semibold text-black/55">{m}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// COINS — a wide trade card: token header, big price, chart, buy/sell.
export function HeroTrade({ className }: { className?: string }) {
    return (
        <div className={cn("mx-auto w-full max-w-[440px] rounded-[28px] bg-white p-7 text-black ring-1 ring-black/[0.05] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]", className)}>
            <div className="flex items-center gap-2">
                <span className="size-10 rounded-full bg-sunset" />
                <div>
                    <p className="text-base font-extrabold tracking-tight">$WAVE</p>
                    <p className="text-[11px] font-semibold text-black/45">Wave Coin</p>
                </div>
                <span className="ml-auto rounded-full bg-lantern/20 px-2.5 py-1 text-[11px] font-bold text-jewel">+18.4%</span>
            </div>
            <p className="mt-4 text-4xl font-extrabold tracking-tight">$0.0428</p>
            <svg viewBox="0 0 200 70" className="mt-2 h-24 w-full" preserveAspectRatio="none">
                <polyline points="0,55 25,48 50,52 75,38 100,42 125,28 150,30 175,16 200,10" fill="none" stroke="var(--color-lantern)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-full bg-lantern py-3 text-center text-sm font-bold">Buy</div>
                <div className="rounded-full bg-black py-3 text-center text-sm font-bold text-white">Sell</div>
            </div>
        </div>
    );
}

// EXPLORE — a staggered masonry collage of feed/short tiles (a discovery grid,
// not a phone).
function CollageTile({ bg, ar, live }: { bg: string; ar: string; live?: boolean }) {
    return (
        <div className={cn("relative overflow-hidden rounded-2xl ring-1 ring-black/[0.05]", bg, ar)}>
            <div className="absolute inset-0 grid place-items-center">
                <span className="grid size-10 place-items-center rounded-full bg-white/80">
                    <HugeiconsIcon icon={PlayIcon} size={18} className="text-black" />
                </span>
            </div>
            {live && <span className="absolute left-2 top-2 rounded bg-red2 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">Live</span>}
        </div>
    );
}

export function HeroCollage({ className }: { className?: string }) {
    return (
        <div className={cn("mx-auto flex w-full max-w-[420px] gap-3", className)}>
            <div className="flex flex-1 flex-col gap-3">
                <CollageTile bg="bg-soft-blue" ar="aspect-[3/4]" live />
                <CollageTile bg="bg-soft-pink" ar="aspect-square" />
            </div>
            <div className="mt-8 flex flex-1 flex-col gap-3">
                <CollageTile bg="bg-pastel-yellow" ar="aspect-square" />
                <CollageTile bg="bg-lantern/30" ar="aspect-[3/4]" live />
            </div>
        </div>
    );
}

// CREATORS — the CreatorScreen phone with a floating payouts card overlapping.
export function HeroCreatorCluster({ className }: { className?: string }) {
    return (
        <div className={cn("relative mx-auto w-[260px] sm:w-[300px]", className)}>
            <PhoneMock className="w-full">
                <CreatorScreen />
            </PhoneMock>
            <div className="absolute -bottom-6 -right-6 hidden w-[210px] rounded-[24px] bg-white p-4 text-black ring-1 ring-black/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] sm:block">
                <div className="flex items-center gap-2">
                    <span className="grid size-8 place-items-center rounded-lg bg-lantern/15">
                        <HugeiconsIcon icon={DollarCircleIcon} size={18} className="text-jewel" strokeWidth={1.8} />
                    </span>
                    <span className="text-xs font-bold">Payouts</span>
                    <span className="ml-auto rounded-full bg-lantern/15 px-2 py-0.5 text-[10px] font-bold text-jewel">USDC</span>
                </div>
                <p className="mt-3 text-2xl font-extrabold tracking-tight">$2,180.50</p>
                <p className="text-[11px] font-semibold text-black/45">Available to claim</p>
            </div>
        </div>
    );
}

// ABOUT — a colorful 3-card bento (timeline + stream + trade, all in one app).
export function HeroBento({ className }: { className?: string }) {
    return (
        <div className={cn("mx-auto grid w-full max-w-3xl gap-4 sm:grid-cols-3", className)}>
            {/* timeline */}
            <div className="rounded-[24px] bg-soft-blue p-4 text-left text-black ring-1 ring-black/[0.04]">
                <div className="flex items-center gap-2">
                    <span className="size-7 rounded-full bg-twitter" />
                    <span className="text-xs font-extrabold">wave</span>
                    <HugeiconsIcon icon={CheckmarkBadge01Icon} size={12} className="text-twitter" />
                </div>
                <p className="mt-2 text-xs font-semibold leading-snug">new set just dropped 🎧</p>
                <div className="mt-2 flex aspect-[16/10] items-center justify-center rounded-xl bg-white/60">
                    <HugeiconsIcon icon={Image01Icon} size={22} className="text-black/20" />
                </div>
                <div className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-black/45">
                    <HugeiconsIcon icon={FavouriteIcon} size={13} className="text-pastelred" /> 842
                </div>
            </div>
            {/* stream */}
            <div className="rounded-[24px] bg-pastel-yellow p-4 text-left text-black ring-1 ring-black/[0.04]">
                <span className="flex w-fit items-center gap-1 rounded-md bg-red2 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
                    <HugeiconsIcon icon={LiveStreaming01Icon} size={11} /> Live
                </span>
                <div className="mt-2 grid aspect-square place-items-center rounded-xl bg-white/60">
                    <span className="grid size-10 place-items-center rounded-full bg-white">
                        <HugeiconsIcon icon={PlayIcon} size={18} className="text-black" />
                    </span>
                </div>
                <p className="mt-2 text-xs font-bold">Friday freestyle</p>
                <p className="text-[11px] font-semibold text-black/45">1.2K watching</p>
            </div>
            {/* trade */}
            <div className="rounded-[24px] bg-soft-pink p-4 text-left text-black ring-1 ring-black/[0.04]">
                <div className="flex items-center gap-2">
                    <span className="size-7 rounded-full bg-sunset" />
                    <span className="text-xs font-extrabold">$WAVE</span>
                    <span className="ml-auto rounded-full bg-lantern/30 px-1.5 py-0.5 text-[10px] font-bold text-jewel">+18%</span>
                </div>
                <p className="mt-2 text-xl font-extrabold tracking-tight">$0.0428</p>
                <svg viewBox="0 0 120 44" className="mt-1 h-12 w-full" preserveAspectRatio="none">
                    <polyline points="0,34 20,30 40,32 60,22 80,26 100,12 120,8" fill="none" stroke="var(--color-jewel)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <div className="mt-2 rounded-full bg-black py-2 text-center text-[11px] font-bold text-white">Trade</div>
            </div>
        </div>
    );
}

// Dark inset info card (Phantom "Your privacy matters") — sits on a colored
// band, darker than its surroundings, with icon, copy and a pill CTA.
export function InsetInfoCard({
    icon,
    title,
    body,
    ctaLabel,
    className,
}: {
    icon: typeof ShieldKeyIcon;
    title: string;
    body: string;
    ctaLabel?: string;
    className?: string;
}) {
    return (
        <div className={cn("w-full max-w-md rounded-[30px] bg-black/85 p-8 text-left ring-1 ring-white/10", className)}>
            <span className="grid size-12 place-items-center rounded-2xl bg-white/10">
                <HugeiconsIcon icon={icon} size={24} className="text-white" strokeWidth={1.8} />
            </span>
            <p className="mt-5 text-2xl font-extrabold tracking-tight text-white">{title}</p>
            <p className="mt-2 text-[15px] font-semibold leading-snug text-white/55">{body}</p>
            {ctaLabel && (
                <span className="mt-6 inline-block rounded-full bg-white px-6 py-3 text-sm font-bold text-black">{ctaLabel}</span>
            )}
        </div>
    );
}

// ── Compact "chip" visuals for CaptionCards rows — small, realistic slices of
// product UI sized to sit inside a ~220px caption-card surface. ----

// Launch a coin — a mini "create token" form.
export function MiniLaunch({ className }: { className?: string }) {
    return (
        <div className={cn("w-full max-w-[220px] rounded-2xl bg-white p-4 text-black ring-1 ring-black/[0.05] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]", className)}>
            <div className="flex items-center gap-2.5">
                <span className="grid size-10 place-items-center rounded-full bg-sunset text-base font-extrabold">$</span>
                <div className="min-w-0 flex-1">
                    <div className="h-2.5 w-16 rounded-full bg-black/80" />
                    <div className="mt-1.5 h-2 w-10 rounded-full bg-black/15" />
                </div>
            </div>
            <div className="mt-3 flex items-center justify-between rounded-xl bg-soft-gray px-3 py-2">
                <span className="text-[11px] font-semibold text-black/45">Ticker</span>
                <span className="text-[12px] font-extrabold">$WAVE</span>
            </div>
            <div className="mt-2 rounded-full bg-lantern py-2 text-center text-[12px] font-bold text-black">Launch</div>
        </div>
    );
}

// Live in-feed chart — token price + green sparkline + market cap.
export function MiniChart({ className }: { className?: string }) {
    return (
        <div className={cn("w-full max-w-[220px] rounded-2xl bg-white p-4 text-black ring-1 ring-black/[0.05] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]", className)}>
            <div className="flex items-center justify-between">
                <span className="text-[13px] font-extrabold tracking-tight">$WAVE</span>
                <span className="rounded-full bg-lantern/20 px-2 py-0.5 text-[10px] font-bold text-jewel">+18.4%</span>
            </div>
            <p className="mt-1 text-xl font-extrabold tracking-tight">$0.0428</p>
            <svg viewBox="0 0 200 60" className="mt-1 h-12 w-full" preserveAspectRatio="none">
                <polyline points="0,48 25,42 50,45 75,32 100,36 125,24 150,26 175,12 200,8" fill="none" stroke="var(--color-lantern)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="mt-2 flex items-center justify-between rounded-xl bg-soft-gray px-3 py-1.5 text-[11px]">
                <span className="font-semibold text-black/45">Market cap</span>
                <span className="font-extrabold">$1.2M</span>
            </div>
        </div>
    );
}

// Creator fees — a mini "you earn on every trade" chip.
export function MiniFees({ className }: { className?: string }) {
    return (
        <div className={cn("w-full max-w-[220px] rounded-2xl bg-white p-4 text-black ring-1 ring-black/[0.05] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]", className)}>
            <div className="flex items-center gap-2">
                <span className="grid size-8 place-items-center rounded-xl bg-lantern/15">
                    <HugeiconsIcon icon={DollarCircleIcon} size={18} className="text-jewel" strokeWidth={1.8} />
                </span>
                <span className="text-xs font-bold">You earn</span>
                <span className="ml-auto rounded-full bg-lantern/15 px-2 py-0.5 text-[10px] font-bold text-jewel">1% fee</span>
            </div>
            <p className="mt-3 text-2xl font-extrabold tracking-tight">+$0.42</p>
            <p className="text-[11px] font-semibold text-black/45">on this trade</p>
            <div className="mt-3 space-y-1.5">
                {[["Buy · nova", "+$0.18"], ["Buy · taylor", "+$0.12"], ["Sell · wave", "+$0.12"]].map(([l, v]) => (
                    <div key={l} className="flex items-center justify-between text-[11px]">
                        <span className="font-semibold text-black/50">{l}</span>
                        <span className="font-extrabold text-jewel">{v}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// Live player tile — a compact 16:9 with LIVE badge + viewers + play.
export function MiniLive({ className }: { className?: string }) {
    return (
        <div className={cn("relative aspect-video w-full max-w-[230px] overflow-hidden rounded-2xl bg-gray1 ring-1 ring-black/10", className)}>
            <span className="absolute left-2.5 top-2.5 flex items-center gap-1 rounded-md bg-red2 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
                <HugeiconsIcon icon={LiveStreaming01Icon} size={11} /> Live
            </span>
            <span className="absolute right-2.5 top-2.5 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-bold text-white">3.4K</span>
            <div className="absolute inset-0 grid place-items-center">
                <span className="grid size-11 place-items-center rounded-full bg-white/90"><HugeiconsIcon icon={PlayIcon} size={20} className="text-black" /></span>
            </div>
        </div>
    );
}

// Vertical short tile.
export function MiniShort({ className, bg = "bg-soft-blue" }: { className?: string; bg?: string }) {
    return (
        <div className={cn("relative aspect-[9/16] w-[120px] overflow-hidden rounded-2xl ring-1 ring-black/[0.06]", bg, className)}>
            <div className="absolute inset-0 grid place-items-center">
                <span className="grid size-9 place-items-center rounded-full bg-white/85"><HugeiconsIcon icon={PlayIcon} size={16} className="text-black" /></span>
            </div>
            <span className="absolute bottom-2 left-2 flex items-center gap-1 text-[10px] font-bold text-black/60"><HugeiconsIcon icon={FavouriteIcon} size={11} className="text-pastelred" /> 12K</span>
        </div>
    );
}

// A mini feed post card.
export function MiniFeed({ className }: { className?: string }) {
    return (
        <div className={cn("w-full max-w-[220px] rounded-2xl bg-white p-3.5 text-black ring-1 ring-black/[0.05] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]", className)}>
            <div className="flex items-center gap-2">
                <span className="size-6 rounded-full bg-twitter" />
                <span className="text-[11px] font-extrabold">wave</span>
                <HugeiconsIcon icon={CheckmarkBadge01Icon} size={11} className="text-twitter" />
                <span className="text-[10px] font-semibold text-black/40">· 2h</span>
            </div>
            <p className="mt-2 text-[11px] font-semibold leading-snug">new set just dropped 🎧</p>
            <div className="mt-2 flex aspect-[16/10] items-center justify-center rounded-lg bg-soft-blue">
                <HugeiconsIcon icon={Image01Icon} size={22} className="text-black/20" />
            </div>
            <div className="mt-2 flex items-center gap-4 text-black/40">
                <span className="flex items-center gap-1 text-[10px] font-semibold"><HugeiconsIcon icon={FavouriteIcon} size={12} className="text-pastelred" /> 842</span>
                <span className="flex items-center gap-1 text-[10px] font-semibold"><HugeiconsIcon icon={Comment01Icon} size={12} /> 96</span>
                <span className="flex items-center gap-1 text-[10px] font-semibold"><HugeiconsIcon icon={RepeatIcon} size={12} /> 31</span>
            </div>
        </div>
    );
}

// Mini encrypted chat card.
export function MiniChat({ className }: { className?: string }) {
    return (
        <div className={cn("w-full max-w-[220px] rounded-2xl bg-white p-3.5 text-black ring-1 ring-black/[0.05] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]", className)}>
            <div className="flex items-center gap-1.5">
                <HugeiconsIcon icon={SecurityLockIcon} size={13} className="text-jewel" strokeWidth={1.8} />
                <span className="text-[10px] font-bold uppercase tracking-wide text-black/40">Encrypted</span>
            </div>
            <div className="mt-2.5 space-y-2">
                <div className="flex justify-start"><span className="max-w-[75%] rounded-2xl rounded-tl-sm bg-soft-gray px-2.5 py-1.5 text-[11px] font-semibold">gm, you live tonight?</span></div>
                <div className="flex justify-end"><span className="max-w-[75%] rounded-2xl rounded-tr-sm bg-twitter px-2.5 py-1.5 text-[11px] font-semibold text-white">9pm, come thru 🔥</span></div>
            </div>
            <div className="mt-2.5 flex items-center gap-2 rounded-full bg-soft-gray px-3 py-1.5 text-[11px] font-semibold text-black/40">
                Message… <HugeiconsIcon icon={SentIcon} size={13} className="ml-auto text-twitter" />
            </div>
        </div>
    );
}

// Mini live-audio space — avatars with speaking rings.
export function MiniSpace({ className }: { className?: string }) {
    return (
        <div className={cn("w-full max-w-[220px] rounded-2xl bg-white p-4 text-black ring-1 ring-black/[0.05] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]", className)}>
            <div className="flex items-center gap-1.5">
                <span className="flex items-center gap-1 rounded-md bg-red2 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white"><HugeiconsIcon icon={LiveStreaming01Icon} size={10} /> Live</span>
                <span className="text-[11px] font-bold">Founders AMA</span>
            </div>
            <div className="mt-3 flex justify-center gap-3">
                {["bg-twitter", "bg-pastelred", "bg-sunset"].map((c, i) => (
                    <div key={c} className="flex flex-col items-center gap-1">
                        <span className={cn("size-11 rounded-full ring-2", c, i === 0 ? "ring-lantern" : "ring-transparent")} />
                        <span className="text-[9px] font-semibold text-black/45">{["host", "nova", "taylor"][i]}</span>
                    </div>
                ))}
            </div>
            <div className="mt-3 flex items-center justify-center gap-1 rounded-full bg-lantern/15 py-1.5 text-[11px] font-bold text-jewel">
                <HugeiconsIcon icon={Mic01Icon} size={13} /> Speaking
            </div>
        </div>
    );
}

// Mini community server — channel list.
export function MiniServer({ className }: { className?: string }) {
    return (
        <div className={cn("w-full max-w-[220px] rounded-2xl bg-white p-4 text-black ring-1 ring-black/[0.05] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]", className)}>
            <div className="flex items-center gap-2">
                <span className="grid size-8 place-items-center rounded-xl bg-pastelred/15"><HugeiconsIcon icon={UserGroupIcon} size={16} className="text-pastelred" strokeWidth={1.8} /></span>
                <span className="text-xs font-extrabold">Degen HQ</span>
                <span className="ml-auto text-[10px] font-semibold text-black/40">4.2K</span>
            </div>
            <div className="mt-3 space-y-1.5">
                {["# general", "# memes", "# alpha", "🔊 lounge"].map((c, i) => (
                    <div key={c} className={cn("rounded-lg px-2.5 py-1.5 text-[11px] font-bold", i === 0 ? "bg-soft-blue text-black" : "text-black/45")}>{c}</div>
                ))}
            </div>
        </div>
    );
}

// Mini security checklist.
export function MiniShield({ className }: { className?: string }) {
    return (
        <div className={cn("w-full max-w-[220px] rounded-2xl bg-white p-4 text-black ring-1 ring-black/[0.05] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]", className)}>
            <span className="grid size-10 place-items-center rounded-2xl bg-twitter/10"><HugeiconsIcon icon={ShieldKeyIcon} size={22} className="text-twitter" strokeWidth={1.8} /></span>
            <p className="mt-3 text-sm font-extrabold tracking-tight">Wallet secured</p>
            <div className="mt-2.5 space-y-1.5">
                {["No seed phrase", "Multi-party keys", "Encrypted by default"].map((t) => (
                    <div key={t} className="flex items-center gap-1.5 text-[11px] font-semibold">
                        <span className="grid size-4 place-items-center rounded-full bg-lantern/20 text-[9px] text-jewel">✓</span>{t}
                    </div>
                ))}
            </div>
        </div>
    );
}

// Mini verified profile.
export function MiniVerified({ className }: { className?: string }) {
    return (
        <div className={cn("w-full max-w-[220px] rounded-2xl bg-white p-4 text-black ring-1 ring-black/[0.05] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]", className)}>
            <div className="flex items-center gap-2.5">
                <span className="size-11 rounded-full bg-sunset" />
                <div>
                    <div className="flex items-center gap-1">
                        <span className="text-[13px] font-extrabold">midnight</span>
                        <HugeiconsIcon icon={CheckmarkBadge01Icon} size={14} className="text-twitter" />
                    </div>
                    <span className="text-[10px] font-semibold text-black/45">Verified creator</span>
                </div>
            </div>
            <div className="mt-3 flex items-center gap-1.5 rounded-xl bg-twitter/10 px-3 py-2 text-[11px] font-bold text-twitter">
                <HugeiconsIcon icon={CheckmarkBadge01Icon} size={13} /> Real person, verified
            </div>
        </div>
    );
}

// Wallet/security summary card — for a bold dark section.
export function SecurityCard({ className }: { className?: string }) {
    return (
        <div className={cn("w-full max-w-sm rounded-[28px] bg-white p-6 text-black shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]", className)}>
            <span className="grid size-12 place-items-center rounded-2xl bg-twitter/10">
                <HugeiconsIcon icon={ShieldKeyIcon} size={26} className="text-twitter" strokeWidth={1.8} />
            </span>
            <p className="mt-4 text-xl font-extrabold tracking-tight">Your keys, your coins</p>
            <p className="mt-1 text-[15px] font-semibold leading-snug text-black/60">Swig multi-party wallets, non-custodial by design.</p>
            <div className="mt-4 space-y-2">
                {["No seed phrase to lose", "End-to-end encrypted messages", "Scam protection built in"].map((t) => (
                    <div key={t} className="flex items-center gap-2 text-xs font-semibold">
                        <span className="grid size-5 place-items-center rounded-full bg-lantern/20 text-jewel">✓</span>
                        {t}
                    </div>
                ))}
            </div>
        </div>
    );
}

// Earnings/payout card — for a bold dark section.
export function EarningsCard({ className }: { className?: string }) {
    return (
        <div className={cn("w-full max-w-sm rounded-[28px] bg-white p-6 text-black shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]", className)}>
            <div className="flex items-center gap-2">
                <span className="grid size-9 place-items-center rounded-xl bg-lantern/15">
                    <HugeiconsIcon icon={DollarCircleIcon} size={20} className="text-jewel" strokeWidth={1.8} />
                </span>
                <span className="text-sm font-bold">Payouts</span>
                <span className="ml-auto rounded-full bg-lantern/15 px-2 py-0.5 text-[10px] font-bold text-jewel">USDC</span>
            </div>
            <p className="mt-4 text-4xl font-extrabold tracking-tight">$2,180.50</p>
            <p className="text-xs font-semibold text-black/45">Available to claim</p>
            <div className="mt-4 space-y-2">
                {[["Subscriptions", "$1,440.00"], ["Tips", "$520.50"], ["Creator fees", "$220.00"]].map(([l, v]) => (
                    <div key={l} className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-black/55">{l}</span>
                        <span className="font-extrabold">{v}</span>
                    </div>
                ))}
            </div>
            <div className="mt-5 rounded-full bg-black py-3 text-center text-sm font-bold text-white">Claim to wallet</div>
        </div>
    );
}
