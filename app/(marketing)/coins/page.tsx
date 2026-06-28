import { Metadata } from "next";
import {
    Rocket01Icon, Analytics01Icon, DollarCircleIcon,
    Wallet01Icon, UserGroupIcon, Coins01Icon,
} from "@hugeicons/core-free-icons";
import { MarketingHero, BoldBlock, BandSection, ExploreMore, Faq, ClosingCta } from "@/components/marketing/sections";
import { FeatureGrid, type Feature } from "@/components/marketing/feature-card";
import { PhoneMock, CoinScreen, EarningsCard } from "@/components/marketing/mocks";

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
                    <div className="relative grid place-items-center overflow-hidden rounded-[36px] bg-soft-blue px-6 py-12">
                        <PhoneMock className="rotate-[-3deg]">
                            <CoinScreen />
                        </PhoneMock>
                    </div>
                }
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

            <BandSection title="Launch in three taps" sub="No contracts, no setup. Name your coin and it's live on a fair bonding curve.">
                <div className="grid gap-4 sm:grid-cols-3">
                    {STEPS.map(([t, b], i) => (
                        <div key={t} className="rounded-3xl bg-white p-7 ring-1 ring-black/[0.06]">
                            <p className="font-pixel text-2xl tracking-tighter text-black/25">{String(i + 1).padStart(2, "0")}</p>
                            <p className="mt-3 text-xl font-extrabold tracking-tight text-black">{t}</p>
                            <p className="mt-1.5 text-[15px] font-semibold leading-snug text-black/60">{b}</p>
                        </div>
                    ))}
                </div>
            </BandSection>

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
