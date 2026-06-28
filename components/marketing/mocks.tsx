import { HugeiconsIcon } from "@hugeicons/react";
import {
    LiveStreaming01Icon, Comment01Icon, FavouriteIcon, CheckmarkBadge01Icon,
    PlayIcon, DollarCircleIcon, RepeatIcon, Image01Icon,
    ShieldKeyIcon, ArrowUp01Icon, ArrowDown01Icon,
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
