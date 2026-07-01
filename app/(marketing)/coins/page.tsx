import { Metadata } from "next";
import {
    MarketingHero,
    CaptionCards,
    TwoUpBold,
    CenterFeature,
    BoldBlock,
    ExploreMore,
    Faq,
    ClosingCta,
} from "@/components/marketing/sections";
import {
    HeroTrade,
    EarningsCard,
    MiniLaunch,
    MiniChart,
    MiniFees,
    StackedCard,
    BlobArt,
    PhoneMock,
    CoinScreen,
} from "@/components/marketing/mocks";

export const metadata: Metadata = { title: "Coins" };

const FAQ = [
    { q: "What chain are coins on?", a: "Coins launch on Solana, with trading and fees handled in-app." },
    { q: "How do creator fees work?", a: "You set a creator fee that's taken on each trade and routed to your wallet automatically." },
    { q: "Is there a wallet included?", a: "Yes. Every account ships with a secure wallet, so you can launch and trade right away." },
];

export default function CoinsPage() {
    return (
        <>
            {/* Hero — big, airy, one confident visual. */}
            <MarketingHero
                eyebrow="Coins"
                title={<>Launch a coin<br />in a single tap</>}
                sub="Give your community a token, trade it right in the feed, and earn on every swap. No contracts, no setup."
                ctaLabel="Launch a coin"
                secondaryLabel="For creators"
                secondaryHref="/creators"
                visual={
                    <div className="relative grid place-items-center rounded-[40px] bg-soft-blue px-6 py-20">
                        {/* ambient brand-tinted glow (no gray/black shadow) */}
                        <div className="pointer-events-none absolute inset-x-10 bottom-6 h-40 rounded-full bg-lantern/25 blur-3xl" />
                        <HeroTrade className="relative" />
                    </div>
                }
            />

            {/* Everything a coin needs — realistic mini-UI, captioned. Replaces
                the old uniform tile grid. */}
            <CaptionCards
                tone="bg-white"
                eyebrow="How it works"
                title="Everything a coin needs, built in"
                sub="Name it, launch it on a fair bonding curve, and start earning — the whole loop lives inside the app."
                cards={[
                    { visual: <MiniLaunch />, bg: "bg-soft-pink", title: "Launch in a tap", body: "Pick a ticker and image. It's live on a fair bonding curve — no contracts to write." },
                    { visual: <MiniChart />, bg: "bg-soft-blue", title: "Trade in the feed", body: "Live charts and market caps, right in the timeline. Buy and sell without leaving the app." },
                    { visual: <MiniFees />, bg: "bg-pastel-yellow", title: "Earn on every swap", body: "Set a creator fee and take a cut of every buy and sell, routed straight to your wallet." },
                ]}
            />

            {/* Phantom-style big centered stacked moment — lots of air. */}
            <CenterFeature
                tone="bg-soft-blue"
                eyebrow="Your community's coin"
                title="A token your people rally around"
                sub="Give your audience something to hold, trade, and grow together — native to the feed they already live in."
                ctaLabel="Launch a coin"
                ctaHref="/login"
                visual={
                    <StackedCard
                        title="$WAVE — the community coin"
                        art={<BlobArt />}
                        tone="bg-white"
                        sheets={["bg-soft-pink", "bg-pastel-yellow"]}
                    />
                }
            />

            {/* Two-up bold cards (Cash App full-reserve / access energy). */}
            <TwoUpBold
                tone="bg-white"
                items={[
                    { title: "Fair launch, from the first buy", body: "Bonding-curve pricing means transparent, predictable value — no insider allocations, no rug.", bg: "bg-lantern", visual: <MiniChart /> },
                    { title: "A wallet on every account", body: "Trade the moment you sign up. No exchange, no bridge, no seed phrase to manage.", bg: "bg-black", dark: true, visual: <PhoneMock className="w-[190px]"><CoinScreen /></PhoneMock> },
                ]}
            />

            {/* Earn — the money moment on black. */}
            <BoldBlock
                tone="bg-black"
                reverse
                title="Get paid on every trade"
                body="Creator fees settle in USDC and land straight in your wallet. Claim any time — the platform takes a flat 5%, nothing more."
                ctaLabel="Start earning"
                ctaHref="/creators"
                visual={<EarningsCard />}
            />

            <ExploreMore currentHref="/coins" className="bg-soft-gray" />
            <Faq items={FAQ} className="bg-white" />
            <ClosingCta
                title="Launch your coin"
                sub="Your community's token is one tap away."
                ctaLabel="Launch a coin"
                tiles={[
                    { title: "One tap", body: "Launch on a fair bonding curve." },
                    { title: "Earn fees", body: "Take a cut of every trade." },
                    { title: "Built-in wallet", body: "Trade right from your account." },
                ]}
            />
        </>
    );
}
