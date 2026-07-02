import { Metadata } from "next";
import {
    MarketingHero,
    CaptionCards,
    TwoUpBold,
    InsetBlock,
    ExploreMore,
    Faq,
} from "@/components/marketing/sections";
import { ColorScrollPage, BgZone } from "@/components/marketing/color-scroll-page";
import { CardCarousel } from "@/components/marketing/card-carousel";
import {
    HeroTrade,
    EarningsCard,
    MiniLaunch,
    MiniChart,
    MiniFees,
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
        <ColorScrollPage className="pt-28 sm:pt-32" initial="var(--color-soft-pink)">
            {/* Zone 1 — soft pink */}
            <BgZone bg="var(--color-soft-pink)">
                <MarketingHero
                    eyebrow="Coins"
                    title={<>Launch a coin<br />in a single tap</>}
                    sub="Give your community a token, trade it right in the feed, and earn on every swap. No contracts, no setup."
                    ctaLabel="Launch a coin"
                    secondaryLabel="For creators"
                    secondaryHref="/creators"
                    visual={
                        <div className="relative grid place-items-center rounded-[40px] bg-white/50 px-6 py-20 ring-1 ring-black/[0.04]">
                            <div className="pointer-events-none absolute inset-x-10 bottom-6 h-40 rounded-full bg-lantern/25 blur-3xl" />
                            <HeroTrade className="relative" />
                        </div>
                    }
                />

                <CaptionCards
                    eyebrow="How it works"
                    title="Everything a coin needs, built in"
                    sub="Name it, launch it on a fair bonding curve, and start earning — the whole loop lives inside the app."
                    cards={[
                        { visual: <MiniLaunch />, bg: "bg-white", title: "Launch in a tap", body: "Pick a ticker and image. It's live on a fair bonding curve — no contracts to write." },
                        { visual: <MiniChart />, bg: "bg-white", title: "Trade in the feed", body: "Live charts and market caps, right in the timeline. Buy and sell without leaving the app." },
                        { visual: <MiniFees />, bg: "bg-white", title: "Earn on every swap", body: "Set a creator fee and take a cut of every buy and sell, routed straight to your wallet." },
                    ]}
                />
            </BgZone>

            {/* Zone 2 — deep dark, the carousel spread moment */}
            <BgZone bg="#0e0f13">
                <CardCarousel
                    dark
                    eyebrow="Your community's coin"
                    title="One token, everything it does"
                    sub="Launch it, trade it in the feed, and earn on every swap — a whole loop your people rally around."
                    cards={[
                        {
                            tone: "bg-soft-blue",
                            node: (
                                <>
                                    <p className="text-lg font-extrabold tracking-tight text-black">Trade in the feed</p>
                                    <div className="mt-4 flex flex-1 items-center justify-center"><MiniChart /></div>
                                </>
                            ),
                        },
                        {
                            tone: "bg-white",
                            node: (
                                <>
                                    <p className="text-lg font-extrabold tracking-tight text-black">$WAVE — your coin</p>
                                    <BlobArt />
                                </>
                            ),
                        },
                        {
                            tone: "bg-lantern",
                            node: (
                                <>
                                    <p className="text-lg font-extrabold tracking-tight text-black">Earn on every trade</p>
                                    <div className="mt-4 flex flex-1 items-center justify-center"><MiniFees /></div>
                                </>
                            ),
                        },
                    ]}
                />
            </BgZone>

            {/* Zone 3 — soft gray */}
            <BgZone bg="var(--color-soft-gray)">
                <TwoUpBold
                    items={[
                        { title: "Fair launch, from the first buy", body: "Bonding-curve pricing means transparent, predictable value — no insider allocations, no rug.", bg: "bg-lantern", visual: <MiniChart /> },
                        { title: "A wallet on every account", body: "Trade the moment you sign up. No exchange, no bridge, no seed phrase to manage.", bg: "bg-black", dark: true, visual: <PhoneMock className="w-[190px]"><CoinScreen /></PhoneMock> },
                    ]}
                />

                <InsetBlock
                    reverse
                    eyebrow="Payouts"
                    title="Get paid on every trade"
                    body="Creator fees settle in USDC and land straight in your wallet. Claim any time — the platform takes a flat 5%, nothing more."
                    ctaLabel="Start earning"
                    ctaHref="/creators"
                    visual={<EarningsCard />}
                />

                <ExploreMore currentHref="/coins" />
                <Faq items={FAQ} />
            </BgZone>
        </ColorScrollPage>
    );
}
