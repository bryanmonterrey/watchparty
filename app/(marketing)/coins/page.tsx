import { Metadata } from "next";
import {
    MarketingHero,
    CaptionCards,
    TwoUpBold,
    InsetBlock,
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
        <ColorScrollPage className="pt-28 sm:pt-32" initial="#0d0b12">
            {/* Zone 1 — soft pink */}
            <BgZone bg="#0d0b12">
                <MarketingHero
                    eyebrow="Coins"
                    title={<>Launch a coin<br />in a single tap</>}
                    sub="Give your community a coin, trade it right in the feed, and earn on every swap. No contracts, no setup."
                    ctaLabel="Launch a coin"
                    secondaryLabel="For creators"
                    secondaryHref="/creators"
                    visual={
                        <div className="relative grid place-items-center rounded-[40px] bg-white/[0.04] px-6 py-20 ring-1 ring-white/[0.08]">
                            <div className="pointer-events-none absolute inset-x-10 bottom-6 h-40 rounded-full bg-lantern/25 blur-3xl" />
                            <HeroTrade className="relative" />
                        </div>
                    }
                />

                <CaptionCards
                    title="Everything a coin needs, built in"
                    sub="Name it, launch it on a fair bonding curve, and start earning. The whole loop lives inside the app."
                    cards={[
                        { visual: <MiniLaunch />, bg: "bg-[#111]", title: "Launch in a tap", body: "Pick a ticker and image. It's live on a fair bonding curve, no contracts to write." },
                        { visual: <MiniChart />, bg: "bg-[#111]", title: "Trade in the feed", body: "Live charts and market caps, right in the timeline. Buy and sell without leaving the app." },
                        { visual: <MiniFees />, bg: "bg-[#111]", title: "Earn on every swap", body: "Set a creator fee and take a cut of every buy and sell, routed straight to your wallet." },
                    ]}
                />
            </BgZone>

            {/* Zone 2 — deep dark, the carousel spread moment */}
            <BgZone bg="#0e0f13">
                <CardCarousel
                    dark
                    title="One coin, everything it does"
                    sub="Launch it, trade it in the feed, and earn on every swap. A whole loop your people rally around."
                    cards={[
                        {
                            tone: "bg-twitter/10",
                            node: (
                                <>
                                    <p className="text-lg font-extrabold tracking-tight text-white">Trade in the feed</p>
                                    <div className="mt-4 flex flex-1 items-center justify-center"><MiniChart /></div>
                                </>
                            ),
                        },
                        {
                            tone: "bg-[#111]",
                            node: (
                                <>
                                    <p className="text-lg font-extrabold tracking-tight text-white">$WAVE, your coin</p>
                                    <BlobArt />
                                </>
                            ),
                        },
                        {
                            tone: "bg-lantern",
                            node: (
                                <>
                                    <p className="text-lg font-extrabold tracking-tight text-white">Earn on every trade</p>
                                    <div className="mt-4 flex flex-1 items-center justify-center"><MiniFees /></div>
                                </>
                            ),
                        },
                    ]}
                />
            </BgZone>

            {/* Zone 3 — soft gray */}
            <BgZone bg="#0a0a0a">
                <TwoUpBold
                    items={[
                        { title: "Fair launch, from the first buy", body: "Bonding-curve pricing means transparent, predictable value. No insider allocations, no rug.", bg: "bg-lantern", visual: <MiniChart /> },
                        { title: "A wallet on every account", body: "Trade the moment you sign up. No exchange, no bridge, no seed phrase to manage.", bg: "bg-black", dark: true, visual: <PhoneMock className="w-[190px]"><CoinScreen /></PhoneMock> },
                    ]}
                />

                <InsetBlock
                    reverse
                    title="Get paid on every trade"
                    body="Creator fees settle in USDC and land straight in your wallet. Claim any time. The platform takes a flat 5%, nothing more."
                    ctaLabel="Start earning"
                    ctaHref="/creators"
                    visual={<EarningsCard />}
                />

                <Faq items={FAQ} />
            </BgZone>
        </ColorScrollPage>
    );
}
