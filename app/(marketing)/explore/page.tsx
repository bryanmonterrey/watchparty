import { Metadata } from "next";
import {
    LiveStreaming01Icon, CameraVideoIcon, Compass01Icon,
    AiSearchIcon, PlayListIcon, GridIcon,
} from "@hugeicons/core-free-icons";
import { MarketingHero, BentoGrid, BoldBlock, CenterFeature, ExploreMore, Faq, ClosingCta } from "@/components/marketing/sections";
import { type Feature } from "@/components/marketing/feature-card";
import { HeroCollage, PhoneMock, CoinScreen } from "@/components/marketing/mocks";

export const metadata: Metadata = { title: "Explore" };

const FEATURES: Feature[] = [
    { icon: LiveStreaming01Icon, title: "Live now", body: "Tune into streams the moment they start.", accent: "text-pastelred" },
    { icon: CameraVideoIcon, title: "Shorts", body: "Quick clips, endless scroll.", accent: "text-twitter" },
    { icon: Compass01Icon, title: "For You", body: "A timeline ranked by the same open algorithm.", accent: "text-jewel" },
    { icon: GridIcon, title: "Categories", body: "Jump to the games and topics you love.", accent: "text-sunset" },
    { icon: AiSearchIcon, title: "Search", body: "Find people, videos, and communities fast.", accent: "text-twitter" },
    { icon: PlayListIcon, title: "Watch later", body: "Queue it up and never lose a video.", accent: "text-pastelred" },
];

const CATEGORIES = ["Just Chatting", "GTA VI", "Music", "Esports", "IRL", "Crypto", "Sports", "Pranks", "Tech"];

// Per-tile bento styling, parallel to FEATURES (mixed sizes for an asymmetric grid).
const BENTO_STYLE = [
    { bg: "bg-soft-pink", accent: "text-pastelred", span: "big" },
    { bg: "bg-soft-blue", accent: "text-twitter" },
    { bg: "bg-pastel-yellow", accent: "text-jewel" },
    { bg: "bg-lantern/30", accent: "text-sunset", span: "wide" },
    { bg: "bg-soft-blue", accent: "text-twitter", span: "wide" },
    { bg: "bg-soft-pink", accent: "text-pastelred", span: "wide" },
] as const;

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
                visual={<HeroCollage />}
            />

            <BentoGrid
                eyebrow="What's inside"
                title="Everything worth watching"
                items={FEATURES.map((f, i) => ({ icon: f.icon, title: f.title, body: f.body, ...BENTO_STYLE[i] }))}
            />

            <BoldBlock
                tone="bg-black"
                reverse
                title="Ranked for you, not for ads"
                body="One open algorithm powers the whole feed, tuned to what you actually watch, so the good stuff finds you."
                ctaLabel="See your feed"
                ctaHref="/login"
                visual={
                    <div className="flex max-w-sm flex-wrap justify-center gap-2.5">
                        {CATEGORIES.map((c, i) => (
                            <span
                                key={c}
                                className={`rounded-full px-4 py-2.5 text-sm font-bold text-black ${["bg-soft-pink", "bg-soft-blue", "bg-pastel-yellow", "bg-lantern"][i % 4]}`}
                            >
                                {c}
                            </span>
                        ))}
                    </div>
                }
            />

            <CenterFeature
                tone="bg-soft-pink"
                eyebrow="Trade as you scroll"
                title="Spot it, buy it, in one tap"
                sub="See a coin in the feed and buy it without leaving the timeline — a secure wallet ships with every account."
                visual={
                    <PhoneMock className="rotate-[-3deg]">
                        <CoinScreen />
                    </PhoneMock>
                }
            />

            <ExploreMore currentHref="/explore" className="bg-white" />
            <Faq items={FAQ} />
            <ClosingCta
                title="Jump in"
                sub="Your feed is waiting."
                tiles={[
                    { title: "One feed", body: "Streams, shorts, and posts together." },
                    { title: "Open algorithm", body: "Ranked by what you actually watch." },
                    { title: "Always free", body: "Watching and posting cost nothing." },
                ]}
            />
        </>
    );
}
