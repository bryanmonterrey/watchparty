import { Metadata } from "next";
import {
    LiveStreaming01Icon, CameraVideoIcon, Compass01Icon,
    AiSearchIcon, PlayListIcon, GridIcon,
} from "@hugeicons/core-free-icons";
import { MarketingHero, BandSection, StepRow, Faq, ClosingCta } from "@/components/marketing/sections";
import { FeatureGrid, type Feature } from "@/components/marketing/feature-card";

export const metadata: Metadata = { title: "Explore" };

const FEATURES: Feature[] = [
    { icon: LiveStreaming01Icon, title: "Live now", body: "Tune into streams the moment they start.", accent: "text-pastelred" },
    { icon: CameraVideoIcon, title: "Shorts", body: "Quick clips, endless scroll.", accent: "text-twitter" },
    { icon: Compass01Icon, title: "For You", body: "A timeline ranked by the same open algorithm you already know.", accent: "text-jewel" },
    { icon: GridIcon, title: "Categories", body: "Jump straight to the games and topics you love.", accent: "text-sunset" },
    { icon: AiSearchIcon, title: "Search", body: "Find people, videos, and communities fast.", accent: "text-twitter" },
    { icon: PlayListIcon, title: "Watch later", body: "Queue it up and never lose a video again.", accent: "text-pastelred" },
];

const STEPS = [
    { title: "Open the feed", body: "Land on a timeline tuned to what you actually watch." },
    { title: "Tap in", body: "Jump into a live stream, short, or post in one tap." },
    { title: "Follow along", body: "Like, reply, and follow to shape what comes next." },
];

const FAQ = [
    { q: "Is watchparty free to use?", a: "Yes. Watching, posting, and following are free. Premium adds extras like verified badges and higher limits." },
    { q: "What can I watch?", a: "Live streams, shorts, and full videos from creators, plus the timeline you already know." },
    { q: "How is my feed ranked?", a: "By the same open algorithm that powers the timeline, tuned to what you engage with." },
];

export default function ExplorePage() {
    return (
        <>
            <MarketingHero
                eyebrow="Explore"
                title={<>Watch what&apos;s happening</>}
                sub="Live streams, shorts, and the timeline you already know, all in one feed."
                secondaryLabel="For creators"
                secondaryHref="/creators"
            />
            <BandSection className="bg-white" title="Everything worth watching">
                <FeatureGrid features={FEATURES} />
            </BandSection>
            <BandSection title="How it works">
                <StepRow steps={STEPS} />
            </BandSection>
            <Faq items={FAQ} className="bg-white" />
            <ClosingCta title="Jump in" sub="Your feed is waiting." />
        </>
    );
}
