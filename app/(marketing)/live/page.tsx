import { Metadata } from "next";
import { MarketingHero, StepFlow, CaptionCards, InsetBlock, CenterFeature, ExploreMore, Faq } from "@/components/marketing/sections";
import { GradientPage } from "@/components/marketing/gradient-page";
import { HeroLandscape, EarningsCard, MiniLive, MiniChat, MiniShort, StackedCard, BlobArt } from "@/components/marketing/mocks";

export const metadata: Metadata = { title: "Go live" };

const FAQ = [
    { q: "What do I need to stream?", a: "Just the app. For a full production setup, use the ingest URL and stream key with OBS or Streamlabs on desktop." },
    { q: "Do my streams get saved?", a: "Yes. Every broadcast is automatically recorded as a VOD on your profile." },
    { q: "Can I make money streaming?", a: "Yes. Turn on subscriptions and accept tips in USDC while you're live." },
];

export default function LivePage() {
    return (
        <GradientPage
            className="pt-28 sm:pt-32"
            stops={[
                "var(--color-soft-pink)",
                "var(--color-soft-blue) 44%",
                "var(--color-pastel-yellow) 76%",
                "#ffffff",
            ]}
        >
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
                eyebrow="How it works"
                title="On air in three steps"
                sub="No gear, no setup. From your pocket to your audience in under a minute."
                steps={[
                    { title: "Open the app", body: "Tap go live from your phone, or plug in OBS on desktop for a full rig." },
                    { title: "Go live", body: "You're streaming to your audience in seconds, with live chat from the first viewer." },
                    { title: "Keep the replay", body: "Every broadcast saves as a VOD automatically, so nobody misses it." },
                ]}
            />

            <CaptionCards
                eyebrow="Built in"
                title="A studio in your pocket"
                sub="Everything a stream needs — chat, clips, and replays — with nothing to set up."
                cards={[
                    { visual: <MiniLive />, bg: "bg-white", title: "One-tap broadcast", body: "Go live from your phone in seconds, or plug in OBS on desktop." },
                    { visual: <MiniChat />, bg: "bg-white", title: "Live chat", body: "Talk with your audience in real time from the very first viewer." },
                    { visual: <MiniShort bg="bg-pastel-yellow" />, bg: "bg-white", title: "Clips & replays", body: "Every stream saves as a VOD, and the best moments become shorts." },
                ]}
            />

            <InsetBlock
                reverse
                eyebrow="Payouts"
                title="Earn while you're live"
                body="Subscriptions, tips, and creator fees land in your wallet in real time, settled in USDC. Going live pays."
                ctaLabel="Start earning"
                ctaHref="/login"
                visual={<EarningsCard />}
            />

            <CenterFeature
                eyebrow="Get discovered"
                title="Your stream, front and center"
                sub="Live broadcasts surface across the feed, search, and categories — so new viewers find you while you're on air."
                visual={
                    <StackedCard
                        title="Live · 3.4K watching"
                        art={<BlobArt />}
                        tone="bg-white"
                        sheets={["bg-soft-blue", "bg-soft-pink"]}
                    />
                }
            />

            <ExploreMore currentHref="/live" />
            <Faq items={FAQ} />
        </GradientPage>
    );
}
