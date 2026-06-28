import { Metadata } from "next";
import {
    Rocket01Icon, Analytics01Icon, DollarCircleIcon,
    Wallet01Icon, UserGroupIcon, Coins01Icon,
} from "@hugeicons/core-free-icons";
import { MarketingHero, StepFlow, BoldBlock, BandSection, ExploreMore, Faq, ClosingCta } from "@/components/marketing/sections";
import { FeatureGrid, type Feature } from "@/components/marketing/feature-card";
import { HeroTrade, EarningsCard } from "@/components/marketing/mocks";

export const metadata: Metadata = { title: "Coins" };

const FEATURES: Feature[] = [
    { icon: Rocket01Icon, title: "Launch in a tap", body: "Spin up a token for your content or community instantly.", accent: "text-pastelred" },
    { icon: Analytics01Icon, title: "Trade in-app", body: "Buy and sell without leaving the app.", accent: "text-twitter" },
    { icon: DollarCircleIcon, title: "Earn creator fees", body: "Take a cut of every trade on your coin.", accent: "text-sunset" },
    { icon: Wallet01Icon, title: "Wallet built in", body: "A secure wallet ships with every account.", accent: "text-jewel" },
    { icon: UserGroupIcon, title: "Your community's coin", body: "Give your audience a token to rally around.", accent: "text-twitter" },
    { icon: Coins01Icon, title: "Fair launch", body: "Bonding-curve pricing, transparent from the first buy.", accent: "text-pastelred" },
];

const STEPS = [
    ["Name it", "Pick a ticker and image."],
    ["Launch it", "Goes live on a fair bonding curve."],
    ["Earn", "Collect a fee on every trade."],
];

const FAQ = [
    { q: "What chain are coins on?", a: "Coins launch on Solana, with trading and fees handled in-app." },
    { q: "How do creator fees work?", a: "You set a creator fee that's taken on each trade and routed to your wallet automatically." },
    { q: "Is there a wallet included?", a: "Yes. Every account ships with a secure wallet, so you can launch and trade right away." },
];

export default function CoinsPage() {
    return (
        <>
            <MarketingHero
                eyebrow="Coins"
                title={<>Launch a coin in a tap</>}
                sub="Give your community a token, trade it in-app, and earn on every swap."
                ctaLabel="Launch a coin"
                secondaryLabel="For creators"
                secondaryHref="/creators"
                visual={
                    <div className="grid place-items-center rounded-[36px] bg-soft-blue px-6 py-14">
                        <HeroTrade />
                    </div>
                }
            />

            <StepFlow
                eyebrow="How it works"
                title="Launch in three taps"
                sub="No contracts, no setup. Name your coin and it's live on a fair bonding curve."
                steps={STEPS.map(([title, body]) => ({ title, body }))}
            />

            <BoldBlock
                tone="bg-soft-blue"
                dark={false}
                title="Trade right in the feed"
                body="Spot a coin in the timeline and buy it in the same tap — live charts, market cap, and a wallet built into every account."
                ctaLabel="See it live"
                ctaHref="/explore"
                visual={<HeroTrade />}
            />

            <BoldBlock
                tone="bg-black"
                reverse
                title="Earn on every trade"
                body="Set a creator fee and take a cut of every buy and sell on your coin, routed straight to your wallet in USDC."
                ctaLabel="Launch a coin"
                ctaHref="/login"
                visual={<EarningsCard />}
            />

            <BandSection className="bg-white" title="Tokens, made simple">
                <FeatureGrid features={FEATURES} />
            </BandSection>

            <ExploreMore currentHref="/coins" className="bg-white" />
            <Faq items={FAQ} />
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
