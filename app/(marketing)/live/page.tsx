import { Metadata } from "next";
import { MarketingHero, StepFlow, SplitShowcase, PosterPanel, Faq } from "@/components/marketing/sections";
import { ColorScrollPage, BgZone } from "@/components/marketing/color-scroll-page";
import { CardCarousel } from "@/components/marketing/card-carousel";
import { HeroLandscape, EarningsCard, MiniLive, MiniChat, MiniShort, StackedCard, BlobArt } from "@/components/marketing/mocks";

export const metadata: Metadata = { title: "Go live" };

// The broadcast page: hero, numbered steps, card spread, an asymmetric
// earnings showcase, and a light poster close on discovery.

const FAQ = [
    { q: "What do I need to stream?", a: "Just the app. For a full production setup, use the ingest URL and stream key with OBS or Streamlabs on desktop." },
    { q: "Do my streams get saved?", a: "Yes. Every broadcast is automatically recorded as a VOD on your profile." },
    { q: "Can I make money streaming?", a: "Yes. Turn on subscriptions and accept tips in USDC while you're live." },
];

export default function LivePage() {
    return (
        <ColorScrollPage className="pt-28 sm:pt-32" initial="var(--color-soft-pink)">
            <BgZone bg="var(--color-soft-pink)">
                <MarketingHero
                    eyebrow="Go live"
                    title={<>Go live in seconds</>}
                    sub="Broadcast to your audience from anywhere, then keep the replay forever."
                    ctaLabel="Start streaming"
                    secondaryLabel="For creators"
                    secondaryHref="/creators"
                    visual={<HeroLandscape />}
                />

                <StepFlow
                    title="On air in three steps"
                    sub="No gear, no setup. From your pocket to your audience in under a minute."
                    steps={[
                        { title: "Open the app", body: "Tap go live from your phone, or plug in OBS on desktop for a full rig." },
                        { title: "Go live", body: "You're streaming to your audience in seconds, with live chat from the first viewer." },
                        { title: "Keep the replay", body: "Every broadcast saves as a VOD automatically, so nobody misses it." },
                    ]}
                />
            </BgZone>

            <BgZone bg="#0e0f13">
                <CardCarousel
                    dark
                    title="A studio in your pocket"
                    sub="Everything a stream needs: chat, clips, and replays, with nothing to set up."
                    cards={[
                        { tone: "bg-soft-blue", node: (<><p className="text-lg font-extrabold tracking-tight text-black">One-tap broadcast</p><div className="mt-4 flex flex-1 items-center justify-center"><MiniLive /></div></>) },
                        { tone: "bg-white", node: (<><p className="text-lg font-extrabold tracking-tight text-black">Live chat</p><div className="mt-4 flex flex-1 items-center justify-center"><MiniChat /></div></>) },
                        { tone: "bg-pastel-yellow", node: (<><p className="text-lg font-extrabold tracking-tight text-black">Clips & replays</p><div className="mt-4 flex flex-1 items-center justify-center"><MiniShort bg="bg-white" /></div></>) },
                    ]}
                />
            </BgZone>

            <BgZone bg="var(--color-soft-blue)">
                <SplitShowcase
                    reverse
                    title="Earn while you're live"
                    body="Subscriptions, tips, and creator fees land in your wallet in real time, settled in USDC. Going live pays."
                    ctaLabel="Start earning"
                    ctaHref="/login"
                    tone="bg-white"
                    visual={<EarningsCard />}
                />
            </BgZone>

            <BgZone bg="#ffffff">
                <PosterPanel
                    title="Your stream, front and center"
                    body="Live broadcasts surface across the feed, search, and categories, so new viewers find you while you're on air."
                    ctaLabel="Start streaming"
                    ctaHref="/login"
                    tone="bg-pastel-yellow"
                    dark={false}
                    visual={
                        <StackedCard
                            title="Live · 3.4K watching"
                            art={<BlobArt />}
                            tone="bg-white"
                            sheets={["bg-soft-blue", "bg-soft-pink"]}
                        />
                    }
                />

                <Faq items={FAQ} />
            </BgZone>
        </ColorScrollPage>
    );
}
