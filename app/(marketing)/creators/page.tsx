import { Metadata } from "next";
import {
    LiveStreaming01Icon, Wallet01Icon, Rocket01Icon,
    Analytics01Icon, UserGroupIcon, SparklesIcon,
} from "@hugeicons/core-free-icons";
import { MarketingHero, BoldBlock, BandSection, ExploreMore, Faq, ClosingCta } from "@/components/marketing/sections";
import { FeatureGrid, type Feature } from "@/components/marketing/feature-card";
import { HeroCreatorCluster, HeroTrade, PhoneMock, LiveScreen, EarningsCard } from "@/components/marketing/mocks";

export const metadata: Metadata = { title: "Creators" };

const FEATURES: Feature[] = [
    { icon: LiveStreaming01Icon, title: "Go live", body: "Broadcast in seconds and bring your audience with you.", accent: "text-pastelred" },
    { icon: Wallet01Icon, title: "Get paid", body: "Subscriptions and payouts, settled in USDC.", accent: "text-twitter" },
    { icon: Rocket01Icon, title: "Launch a coin", body: "Spin up a token for your community in a tap.", accent: "text-sunset" },
    { icon: Analytics01Icon, title: "Know your audience", body: "Analytics and insights on what's landing.", accent: "text-jewel" },
    { icon: UserGroupIcon, title: "Build community", body: "Servers, spaces, and group chats around your work.", accent: "text-twitter" },
    { icon: SparklesIcon, title: "Stand out", body: "Verified badges and reply boost on Premium.", accent: "text-pastelred" },
];

const FAQ = [
    { q: "How do payouts work?", a: "Fans subscribe or tip in USDC; you claim your balance minus a small platform fee, straight to your wallet." },
    { q: "Do I need special gear to stream?", a: "No. Go live from the app, or plug in OBS on desktop for a full production setup." },
    { q: "What does it cost?", a: "Creating is free. Premium unlocks higher limits, analytics, and the largest reply boost." },
];

export default function CreatorsPage() {
    return (
        <>
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

            <BoldBlock
                tone="bg-soft-pink"
                dark={false}
                title="Go live in seconds"
                body="Stream from your phone, chat with your audience in real time, and keep every broadcast as a replay."
                ctaLabel="Start streaming"
                ctaHref="/live"
                visual={
                    <PhoneMock className="rotate-[-3deg]">
                        <LiveScreen />
                    </PhoneMock>
                }
            />

            <BoldBlock
                tone="bg-black"
                reverse
                title="Get paid to create"
                body="Turn followers into income with subscriptions, tips, and creator fees, all settled in USDC and claimed straight to your wallet."
                ctaLabel="Start earning"
                ctaHref="/login"
                visual={<EarningsCard />}
            />

            <BoldBlock
                tone="bg-soft-blue"
                dark={false}
                title="Launch a coin for your community"
                body="Give your audience a token to rally around, trade it in-app, and earn a fee on every swap."
                ctaLabel="Launch a coin"
                ctaHref="/coins"
                visual={<HeroTrade />}
            />

            <BandSection className="bg-white" title="Your creator toolkit">
                <FeatureGrid features={FEATURES} />
            </BandSection>

            <ExploreMore currentHref="/creators" className="bg-white" />
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
        </>
    );
}
