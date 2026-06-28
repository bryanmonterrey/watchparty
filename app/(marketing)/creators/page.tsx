import { Metadata } from "next";
import {
    LiveStreaming01Icon, Wallet01Icon, Rocket01Icon,
    Analytics01Icon, UserGroupIcon, SparklesIcon,
} from "@hugeicons/core-free-icons";
import { MarketingHero, BoldBlock, BandSection, ExploreMore, Faq, ClosingCta } from "@/components/marketing/sections";
import { FeatureGrid, type Feature } from "@/components/marketing/feature-card";
import { PhoneMock, CreatorScreen, LiveScreen, EarningsCard } from "@/components/marketing/mocks";

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
                ctaLabel="Start creating"
                secondaryLabel="Launch a coin"
                secondaryHref="/coins"
                visual={
                    <div className="relative grid place-items-center overflow-hidden rounded-[36px] bg-soft-pink px-6 py-12">
                        <PhoneMock className="rotate-[-3deg]">
                            <CreatorScreen />
                        </PhoneMock>
                    </div>
                }
            />

            <BoldBlock
                tone="bg-black"
                title="Get paid to create"
                body="Turn followers into income with subscriptions, tips, and creator fees, all settled in USDC and claimed straight to your wallet."
                ctaLabel="Start earning"
                ctaHref="/login"
                visual={<EarningsCard />}
            />

            <BandSection title="Go live in seconds" sub="Stream from your phone, chat with your audience in real time, and keep every broadcast as a replay.">
                <div className="grid items-center gap-10 lg:grid-cols-2">
                    <div className="order-2 lg:order-1 grid gap-4">
                        {[
                            ["One-tap broadcast", "Go live from your phone or plug in OBS on desktop."],
                            ["Live chat", "Talk with your audience as you stream."],
                            ["Every replay saved", "Streams become VODs automatically."],
                        ].map(([t, b]) => (
                            <div key={t} className="rounded-2xl bg-white p-5 ring-1 ring-black/[0.06]">
                                <p className="text-lg font-extrabold tracking-tight text-black">{t}</p>
                                <p className="mt-1 text-[15px] font-semibold leading-snug text-black/60">{b}</p>
                            </div>
                        ))}
                    </div>
                    <div className="order-1 lg:order-2 grid place-items-center overflow-hidden rounded-[36px] bg-soft-blue px-6 py-12">
                        <PhoneMock className="rotate-[3deg]">
                            <LiveScreen />
                        </PhoneMock>
                    </div>
                </div>
            </BandSection>

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
