import { Metadata } from "next";
import { MarketingHero, TwoUpBold, CaptionCards, InsetBlock, CenterFeature, ExploreMore, Faq, ClosingCta } from "@/components/marketing/sections";
import { GradientPage } from "@/components/marketing/gradient-page";
import {
    HeroCreatorCluster, HeroTrade, PhoneMock, LiveScreen, EarningsCard,
    MiniLive, MiniVerified, MiniFees, StackedCard, BlobArt,
} from "@/components/marketing/mocks";

export const metadata: Metadata = { title: "Creators" };

const FAQ = [
    { q: "How do payouts work?", a: "Fans subscribe or tip in USDC; you claim your balance minus a small platform fee, straight to your wallet." },
    { q: "Do I need special gear to stream?", a: "No. Go live from the app, or plug in OBS on desktop for a full production setup." },
    { q: "What does it cost?", a: "Creating is free. Premium unlocks higher limits, analytics, and the largest reply boost." },
];

export default function CreatorsPage() {
    return (
        <GradientPage
            className="pt-28 sm:pt-32"
            stops={[
                "var(--color-pastel-yellow)",
                "var(--color-soft-pink) 40%",
                "var(--color-soft-blue) 72%",
                "var(--color-soft-gray)",
            ]}
        >
            <MarketingHero
                eyebrow="Creators"
                title={<>Built for creators</>}
                sub="Everything you need to go live, grow, and get paid, without leaving the timeline."
                variant="reverse"
                ctaLabel="Start creating"
                secondaryLabel="Launch a coin"
                secondaryHref="/coins"
                visual={<HeroCreatorCluster />}
            />

            <TwoUpBold
                items={[
                    { title: "Go live in seconds", body: "Stream from your phone, chat in real time, and keep every broadcast as a replay.", bg: "bg-soft-pink", visual: <PhoneMock className="w-[180px]"><LiveScreen /></PhoneMock> },
                    { title: "Launch a coin for your people", body: "Give your community a token to rally around, trade it in-app, and earn a fee on every swap.", bg: "bg-black", dark: true, visual: <HeroTrade className="max-w-[300px]" /> },
                ]}
            />

            <CaptionCards
                eyebrow="Your toolkit"
                title="A creator business in one app"
                sub="Broadcast, verify, and earn — the whole operation lives where your audience already is."
                cards={[
                    { visual: <MiniLive />, bg: "bg-white", title: "Go live", body: "Broadcast in seconds from phone or desktop, and bring your audience with you." },
                    { visual: <MiniVerified />, bg: "bg-white", title: "Stand out", body: "Verified badges and reply boost so the right people know it's really you." },
                    { visual: <MiniFees />, bg: "bg-white", title: "Earn on trades", body: "Launch a coin and take a cut of every swap, routed to your wallet in USDC." },
                ]}
            />

            <InsetBlock
                reverse
                eyebrow="Payouts"
                title="Get paid to create"
                body="Turn followers into income with subscriptions, tips, and creator fees — all settled in USDC and claimed straight to your wallet."
                ctaLabel="Start earning"
                ctaHref="/login"
                visual={<EarningsCard />}
            />

            <CenterFeature
                eyebrow="Your community"
                title="Grow something that's yours"
                sub="A stage, a timeline, and a wallet in one place — so your audience, your content, and your income all live together."
                ctaLabel="Start creating"
                ctaHref="/login"
                visual={
                    <StackedCard
                        title="Your channel, your coin, your community"
                        art={<BlobArt />}
                        tone="bg-white"
                        sheets={["bg-soft-blue", "bg-pastel-yellow"]}
                    />
                }
            />

            <ExploreMore currentHref="/creators" />
            <Faq items={FAQ} />
            <ClosingCta
                title="Start creating"
                sub="Your audience is already here."
                ctaLabel="Start creating"
                tiles={[
                    { title: "Go live", body: "Stream to an audience that's already here." },
                    { title: "Get paid", body: "Subscriptions and tips in USDC." },
                    { title: "Grow", body: "Analytics, reply boost, and verified badges." },
                ]}
            />
        </GradientPage>
    );
}
