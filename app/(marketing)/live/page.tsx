import { Metadata } from "next";
import {
    LiveStreaming01Icon, Comment01Icon, Tv01Icon,
    DollarCircleIcon, CameraVideoIcon, Compass01Icon,
} from "@hugeicons/core-free-icons";
import { MarketingHero, BandSection, StepRow, Faq, ClosingCta } from "@/components/marketing/sections";
import { FeatureGrid, type Feature } from "@/components/marketing/feature-card";

export const metadata: Metadata = { title: "Go live" };

const FEATURES: Feature[] = [
    { icon: LiveStreaming01Icon, title: "One-tap broadcast", body: "Go live from your phone in seconds.", accent: "text-pastelred" },
    { icon: Comment01Icon, title: "Live chat", body: "Talk with your audience in real time as you stream.", accent: "text-twitter" },
    { icon: Tv01Icon, title: "Stream and save", body: "Every stream becomes a VOD automatically.", accent: "text-jewel" },
    { icon: DollarCircleIcon, title: "Earn while live", body: "Subscriptions and tips, paid in USDC.", accent: "text-sunset" },
    { icon: CameraVideoIcon, title: "Phone or desktop", body: "Go live in-app, or plug in OBS for a full setup.", accent: "text-twitter" },
    { icon: Compass01Icon, title: "Get discovered", body: "Live streams surface across the feed and search.", accent: "text-pastelred" },
];

const STEPS = [
    { title: "Tap go live", body: "Start from the app or connect OBS with your stream key." },
    { title: "Bring the crowd", body: "Followers get notified the moment you start." },
    { title: "Keep the replay", body: "Your stream saves as a VOD for anyone who missed it." },
];

const FAQ = [
    { q: "What do I need to stream?", a: "Just the app. For a full production setup, use the ingest URL and stream key with OBS or Streamlabs on desktop." },
    { q: "Do my streams get saved?", a: "Yes. Every broadcast is automatically recorded as a VOD on your profile." },
    { q: "Can I make money streaming?", a: "Yes. Turn on subscriptions and accept tips in USDC while you're live." },
];

export default function LivePage() {
    return (
        <>
            <MarketingHero
                eyebrow="Go live"
                title={<>Go live in seconds</>}
                sub="Broadcast to your audience from anywhere, then keep the replay forever."
                ctaLabel="Start streaming"
                secondaryLabel="For creators"
                secondaryHref="/creators"
            />
            <BandSection className="bg-white" title="Streaming, built in">
                <FeatureGrid features={FEATURES} />
            </BandSection>
            <BandSection title="How it works">
                <StepRow steps={STEPS} />
            </BandSection>
            <Faq items={FAQ} className="bg-white" />
            <ClosingCta title="Go live today" sub="Your first stream is one tap away." ctaLabel="Start streaming" />
        </>
    );
}
