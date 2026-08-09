import { cn } from "@/lib/utils";

// Code-card visuals for the developer pages. The whole portal is a
// SELF-COLOURED dark shell, so every colour here is fixed (white/lantern/etc.),
// never a theme token — the CLAUDE.md black-on-black lesson. One accent per
// surface: lantern plays the terminal green.

/** Dark terminal/code panel with a chrome row. */
export function CodeCard({
    label,
    children,
    className,
}: {
    label: string;
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "overflow-hidden rounded-[20px] bg-black ring-1 ring-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]",
                className,
            )}
        >
            <div className="flex items-center gap-2 border-b border-white/[0.08] px-5 py-3">
                <span className="size-2 rounded-full bg-white/15" />
                <span className="size-2 rounded-full bg-white/15" />
                <p className="ml-2 truncate font-mono text-[11px] font-medium tracking-wide text-white/40">{label}</p>
            </div>
            <pre className="overflow-x-auto px-5 py-4 font-mono text-[12px] leading-[1.75] text-white/85">
                {children}
            </pre>
        </div>
    );
}

// Tiny span helpers so the JSON reads like a real highlighted terminal.
export const K = ({ children }: { children: React.ReactNode }) => (
    <span className="text-white/45">{children}</span>
);
export const S = ({ children }: { children: React.ReactNode }) => (
    <span className="text-lantern">{children}</span>
);
export const P = ({ children }: { children: React.ReactNode }) => (
    <span className="text-white/35">{children}</span>
);

/** The request half: curl with an API key. */
export function CurlCard({ className }: { className?: string }) {
    return (
        <CodeCard label="terminal" className={className}>
            <span className="text-white/40">$ </span>curl https://watchparty.xyz/api/trpc/trade.getFeed \{"\n"}
            {"    "}-H <S>&quot;x-api-key: wp_live_9f2c…&quot;</S>
        </CodeCard>
    );
}

/** The 402 challenge — the product's most distinctive response. */
export function ChallengeCard({ className }: { className?: string }) {
    return (
        <CodeCard label="402 · payment required" className={className}>
            <P>{"{"}</P>{"\n"}
            {"  "}<K>&quot;x402Version&quot;</K><P>:</P> 1<P>,</P>{"\n"}
            {"  "}<K>&quot;accepts&quot;</K><P>: [{"{"}</P>{"\n"}
            {"    "}<K>&quot;scheme&quot;</K><P>:</P> <S>&quot;exact&quot;</S><P>,</P>{"\n"}
            {"    "}<K>&quot;network&quot;</K><P>:</P> <S>&quot;solana&quot;</S><P>,</P>{"\n"}
            {"    "}<K>&quot;maxAmountRequired&quot;</K><P>:</P> <S>&quot;1000&quot;</S><P>,</P>{"\n"}
            {"    "}<K>&quot;asset&quot;</K><P>:</P> <S>&quot;EPjF…USDC&quot;</S>{"\n"}
            {"  "}<P>{"}]"}</P>{"\n"}
            <P>{"}"}</P>
        </CodeCard>
    );
}

export function FeedCard({ className }: { className?: string }) {
    return (
        <CodeCard label="200 · trade.getFeed" className={className}>
            <P>{"{"}</P>{"\n"}
            {"  "}<K>&quot;ticker&quot;</K><P>:</P> <S>&quot;WIF&quot;</S><P>,</P>{"\n"}
            {"  "}<K>&quot;priceUsd&quot;</K><P>:</P> 1.84<P>,</P>{"\n"}
            {"  "}<K>&quot;change24hPct&quot;</K><P>:</P> 12.6<P>,</P>{"\n"}
            {"  "}<K>&quot;volume24hUsd&quot;</K><P>:</P> 4210033{"\n"}
            <P>{"}"}</P>
        </CodeCard>
    );
}

export function CoinCard({ className }: { className?: string }) {
    return (
        <CodeCard label="200 · trade.lookupCoin" className={className}>
            <P>{"{"}</P>{"\n"}
            {"  "}<K>&quot;source&quot;</K><P>:</P> <S>&quot;watchparty&quot;</S><P>,</P>{"\n"}
            {"  "}<K>&quot;ticker&quot;</K><P>:</P> <S>&quot;ANSEM&quot;</S><P>,</P>{"\n"}
            {"  "}<K>&quot;marketCapUsd&quot;</K><P>:</P> 9120044{"\n"}
            <P>{"}"}</P>
        </CodeCard>
    );
}

export function LiveCard({ className }: { className?: string }) {
    return (
        <CodeCard label="200 · stream.listLive" className={className}>
            <P>{"["}{"{"}</P>{"\n"}
            {"  "}<K>&quot;title&quot;</K><P>:</P> <S>&quot;late night trades&quot;</S><P>,</P>{"\n"}
            {"  "}<K>&quot;category&quot;</K><P>:</P> <S>&quot;Crypto&quot;</S><P>,</P>{"\n"}
            {"  "}<K>&quot;viewerCount&quot;</K><P>:</P> 1204{"\n"}
            <P>{"}"}{"]"}</P>
        </CodeCard>
    );
}

export function SettleCard({ className }: { className?: string }) {
    return (
        <CodeCard label="200 · settled via x402" className={className}>
            <span className="text-white/40">← </span>X-PAYMENT-RESPONSE<P>:</P> <S>&quot;eyJzdWNjZXNzIjp0cnVlfQ==&quot;</S>{"\n"}
            <span className="text-white/40">← </span>200 OK <P>· $0.001 settled in USDC</P>
        </CodeCard>
    );
}

/** Hero visual: request over response, with the price chip floating between. */
export function HeroApiMock({ className }: { className?: string }) {
    return (
        <div className={cn("relative mx-auto w-full max-w-[460px]", className)}>
            <CurlCard className="relative z-[1] -rotate-1" />
            <div className="relative z-[2] -mt-2 flex justify-end pr-6">
                <span className="rounded-full bg-lantern px-4 py-1.5 text-[13px] font-bold text-black">
                    from $0.001 per call
                </span>
            </div>
            <FeedCard className="relative -mt-2 rotate-1" />
        </div>
    );
}
