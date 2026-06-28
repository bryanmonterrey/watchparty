import { Metadata } from "next";
import {
    LiveStreaming01Icon, Wallet01Icon, Rocket01Icon,
    Analytics01Icon, UserGroupIcon, SparklesIcon,
} from "@hugeicons/core-free-icons";
import { MarketingHero, ShowcaseRow, BandSection, Faq, ClosingCta } from "@/components/marketing/sections";
import { FeatureGrid, type Feature } from "@/components/marketing/feature-card";

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
                panelTone="bg-soft-pink"
                panelLabel="Creator profile"
            />
            <ShowcaseRow
                title="Go live, get paid"
                body="Stream to your audience and earn from subscriptions and tips the moment you go live."
                ctaLabel="Start streaming"
                ctaHref="/live"
                panelTone="bg-soft-blue"
                panelLabel="Live + payouts"
            />
            <ShowcaseRow
                reverse
                title="Own your community"
                body="Launch a coin, spin up a server, and give your fans a place to rally, all in one app."
                panelTone="bg-pastel-yellow"
                panelLabel="Community"
            />
            <BandSection className="bg-white" title="Your creator toolkit">
                <FeatureGrid features={FEATURES} />
            </BandSection>
            <Faq items={FAQ} />
            <ClosingCta title="Start creating" sub="Your audience is already here." ctaLabel="Start creating" />
        </>
    );
}
