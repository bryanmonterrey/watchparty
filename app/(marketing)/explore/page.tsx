import { Metadata } from "next";
import {
    LiveStreaming01Icon, CameraVideoIcon, Compass01Icon,
    AiSearchIcon, PlayListIcon, GridIcon,
} from "@hugeicons/core-free-icons";
import { MarketingHero, BoldBlock, BandSection, ExploreMore, Faq, ClosingCta } from "@/components/marketing/sections";
import { FeatureGrid, type Feature } from "@/components/marketing/feature-card";
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

            <BandSection title="Trade as you scroll" sub="Spot a coin in the feed and buy it in the same tap, with a wallet built into every account.">
                <div className="grid items-center gap-10 lg:grid-cols-2">
                    <div className="grid place-items-center overflow-hidden rounded-[36px] bg-soft-pink px-6 py-12">
                        <PhoneMock className="rotate-[3deg]">
                            <CoinScreen />
                        </PhoneMock>
                    </div>
                    <div className="grid gap-4">
                        {[
                            ["In-feed trading", "Buy and sell without leaving the timeline."],
                            ["Live prices", "Charts and market caps update in real time."],
                            ["Built-in wallet", "Every account ships with a secure wallet."],
                        ].map(([t, b]) => (
                            <div key={t} className="rounded-2xl bg-white p-5 ring-1 ring-black/[0.06]">
                                <p className="text-lg font-extrabold tracking-tight text-black">{t}</p>
                                <p className="mt-1 text-[15px] font-semibold leading-snug text-black/60">{b}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </BandSection>

            <BandSection className="bg-white" title="Everything worth watching">
                <FeatureGrid features={FEATURES} />
            </BandSection>

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
