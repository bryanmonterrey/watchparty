import { Metadata } from "next";
import {
    LiveStreaming01Icon, Comment01Icon, Tv01Icon,
    DollarCircleIcon, CameraVideoIcon, Compass01Icon,
} from "@hugeicons/core-free-icons";
import { MarketingHero, ShowcaseRow, BandSection, ExploreMore, Faq, ClosingCta } from "@/components/marketing/sections";
import { FeatureGrid, type Feature } from "@/components/marketing/feature-card";

export const metadata: Metadata = { title: "Go live" };

const FEATURES: Feature[] = [
    { icon: LiveStreaming01Icon, title: "One-tap broadcast", body: "Go live from your phone in seconds.", accent: "text-pastelred" },
    { icon: Comment01Icon, title: "Live chat", body: "Talk with your audience in real time.", accent: "text-twitter" },
    { icon: Tv01Icon, title: "Stream and save", body: "Every stream becomes a VOD automatically.", accent: "text-jewel" },
    { icon: DollarCircleIcon, title: "Earn while live", body: "Subscriptions and tips, paid in USDC.", accent: "text-sunset" },
    { icon: CameraVideoIcon, title: "Phone or desktop", body: "Go live in-app, or plug in OBS for a full setup.", accent: "text-twitter" },
    { icon: Compass01Icon, title: "Get discovered", body: "Live streams surface across the feed and search.", accent: "text-pastelred" },
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
                panelTone="bg-pastel-yellow"
                panelLabel="Live stream"
                panelIcon={LiveStreaming01Icon}
            />
            <ShowcaseRow
                title="Broadcast from anywhere"
                body="Start from your phone in one tap, or plug in OBS on desktop for a full production setup."
                panelTone="bg-soft-blue"
                panelLabel="Go live"
                panelIcon={CameraVideoIcon}
            />
            <ShowcaseRow
                reverse
                title="Keep every replay"
                body="Streams save as VODs automatically, so anyone who missed it can still watch."
                panelTone="bg-soft-pink"
                panelLabel="VOD library"
                panelIcon={Tv01Icon}
            />
            <BandSection className="bg-white" title="Streaming, built in">
                <FeatureGrid features={FEATURES} />
            </BandSection>
            <ExploreMore currentHref="/live" className="bg-white" />
            <Faq items={FAQ} />
            <ClosingCta
                title="Go live today"
                sub="Your first stream is one tap away."
                ctaLabel="Start streaming"
                tiles={[
                    { title: "One tap", body: "Go live from your phone in seconds." },
                    { title: "Earn live", body: "Subscriptions and tips while you stream." },
                    { title: "Every replay", body: "Streams save as VODs automatically." },
                ]}
            />
        </>
    );
}
