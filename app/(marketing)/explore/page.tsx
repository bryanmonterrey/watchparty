import { Metadata } from "next";
import {
    LiveStreaming01Icon, CameraVideoIcon, Compass01Icon,
    AiSearchIcon, PlayListIcon, GridIcon,
} from "@hugeicons/core-free-icons";
import { MarketingHero, BentoGrid, SplitShowcase, PosterPanel, MarqueeBand, Faq } from "@/components/marketing/sections";
import { ColorScrollPage, BgZone } from "@/components/marketing/color-scroll-page";
import { CardCarousel } from "@/components/marketing/card-carousel";
import { type Feature } from "@/components/marketing/feature-card";
import { HeroCollage, PhoneMock, CoinScreen, MiniLive, MiniShort, MiniFeed } from "@/components/marketing/mocks";

export const metadata: Metadata = { title: "Explore" };

// The discovery page: split hero, kinetic marquee divider, card spread, an
// asymmetric feed showcase, varied bento, and a dark poster close.

const FEATURES: Feature[] = [
    { icon: LiveStreaming01Icon, title: "Live now", body: "Tune into streams the moment they start.", accent: "text-pastelred" },
    { icon: CameraVideoIcon, title: "Shorts", body: "Quick clips, endless scroll.", accent: "text-twitter" },
    { icon: Compass01Icon, title: "For You", body: "A timeline ranked by the same open algorithm.", accent: "text-jewel" },
    { icon: GridIcon, title: "Categories", body: "Jump to the games and topics you love.", accent: "text-sunset" },
    { icon: AiSearchIcon, title: "Search", body: "Find people, videos, and communities fast.", accent: "text-twitter" },
    { icon: PlayListIcon, title: "Watch later", body: "Queue it up and never lose a video.", accent: "text-pastelred" },
];

const CATEGORIES = ["Just Chatting", "GTA VI", "Music", "Esports", "IRL", "Crypto", "Sports", "Pranks", "Tech"];

// Varied fills so the grid reads as color-as-identity, not white-on-white tiles.
const BENTO_STYLE = [
    { bg: "bg-soft-pink", accent: "text-pastelred", span: "big" },
    { bg: "bg-white", accent: "text-twitter" },
    { bg: "bg-pastel-yellow", accent: "text-jewel" },
    { bg: "bg-white", accent: "text-sunset", span: "wide" },
    { bg: "bg-soft-blue", accent: "text-twitter", span: "wide" },
    { bg: "bg-white", accent: "text-pastelred", span: "wide" },
] as const;

const FAQ = [
    { q: "Is watchparty free to use?", a: "Yes. Watching, posting, and following are free. Premium adds extras like verified badges and higher limits." },
    { q: "What can I watch?", a: "Live streams, shorts, and full videos from creators, plus the timeline you already know." },
    { q: "How is my feed ranked?", a: "By the same open algorithm that powers the timeline, tuned to what you engage with." },
];

export default function ExplorePage() {
    return (
        <ColorScrollPage className="pt-28 sm:pt-32" initial="var(--color-soft-blue)">
            <BgZone bg="var(--color-soft-blue)">
                <MarketingHero
                    eyebrow="Explore"
                    title={<>Watch what&apos;s happening</>}
                    sub="Live streams, shorts, and the timeline you already know, all in one feed."
                    secondaryLabel="For creators"
                    secondaryHref="/creators"
                    visual={<HeroCollage />}
                />
            </BgZone>

            <BgZone bg="#0e0f13">
                <CardCarousel
                    dark
                    title="Everything worth watching"
                    sub="Streams, shorts, and posts share the same timeline. No apps to switch between."
                    cards={[
                        { tone: "bg-soft-pink", node: (<><p className="text-lg font-extrabold tracking-tight text-black">Live now</p><div className="mt-4 flex flex-1 items-center justify-center"><MiniLive /></div></>) },
                        { tone: "bg-white", node: (<><p className="text-lg font-extrabold tracking-tight text-black">Shorts</p><div className="mt-4 flex flex-1 items-center justify-center"><MiniShort /></div></>) },
                        { tone: "bg-soft-blue", node: (<><p className="text-lg font-extrabold tracking-tight text-black">For You</p><div className="mt-4 flex flex-1 items-center justify-center"><MiniFeed /></div></>) },
                    ]}
                />
            </BgZone>

            <BgZone bg="var(--color-soft-pink)">
                <SplitShowcase
                    title="Ranked for you, not for ads"
                    body="One open algorithm powers the whole feed, tuned to what you actually watch, so the good stuff finds you."
                    ctaLabel="See your feed"
                    ctaHref="/login"
                    tone="bg-white"
                    visual={
                        <div className="flex max-w-md flex-wrap justify-center gap-2.5">
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

                {/* Kinetic divider: keep it between two LIGHT zones — at a
                    light/dark boundary the bg flips while the black type is
                    still on screen and the band goes unreadable. */}
                <MarqueeBand items={["Live", "Shorts", "Spaces", "Coins", "Timeline"]} />

                <BentoGrid
                    title="A whole home for watching"
                    items={FEATURES.map((f, i) => ({ icon: f.icon, title: f.title, body: f.body, ...BENTO_STYLE[i] }))}
                />
            </BgZone>

            <BgZone bg="#ffffff">
                <PosterPanel
                    title="Spot it, buy it, in one tap"
                    body="See a coin in the feed and buy it without leaving the timeline. A secure wallet ships with every account."
                    ctaLabel="Get started"
                    ctaHref="/login"
                    visual={
                        <PhoneMock className="rotate-[-3deg]">
                            <CoinScreen />
                        </PhoneMock>
                    }
                />

                <Faq items={FAQ} />
            </BgZone>
        </ColorScrollPage>
    );
}
