import { Metadata } from "next";
import {
    LiveStreaming01Icon, CameraVideoIcon, Compass01Icon,
    AiSearchIcon, PlayListIcon, GridIcon,
} from "@hugeicons/core-free-icons";
import { MarketingHero, ShowcaseRow, BandSection, Faq, ClosingCta } from "@/components/marketing/sections";
import { FeatureGrid, type Feature } from "@/components/marketing/feature-card";

export const metadata: Metadata = { title: "Explore" };

const FEATURES: Feature[] = [
    { icon: LiveStreaming01Icon, title: "Live now", body: "Tune into streams the moment they start.", accent: "text-pastelred" },
    { icon: CameraVideoIcon, title: "Shorts", body: "Quick clips, endless scroll.", accent: "text-twitter" },
    { icon: Compass01Icon, title: "For You", body: "A timeline ranked by the same open algorithm.", accent: "text-jewel" },
    { icon: GridIcon, title: "Categories", body: "Jump to the games and topics you love.", accent: "text-sunset" },
    { icon: AiSearchIcon, title: "Search", body: "Find people, videos, and communities fast.", accent: "text-twitter" },
    { icon: PlayListIcon, title: "Watch later", body: "Queue it up and never lose a video.", accent: "text-pastelred" },
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
                panelTone="bg-soft-blue"
                panelLabel="Feed preview"
            />
            <ShowcaseRow
                title="One feed for everything"
                body="Streams, shorts, and posts in a single timeline, ranked by an open algorithm tuned to you."
                panelTone="bg-soft-pink"
                panelLabel="Timeline"
            />
            <ShowcaseRow
                reverse
                title="Never miss a moment"
                body="Live streams surface the instant they start, and save as replays for anyone who missed it."
                panelTone="bg-pastel-yellow"
                panelLabel="Live now"
            />
            <BandSection className="bg-white" title="Everything worth watching">
                <FeatureGrid features={FEATURES} />
            </BandSection>
            <Faq items={FAQ} />
            <ClosingCta title="Jump in" sub="Your feed is waiting." />
        </>
    );
}
