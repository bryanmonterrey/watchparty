import { Metadata } from "next";
import { MarketingHero, TwoUpBold, InsetBlock, CenterFeature, ExploreMore, Faq } from "@/components/marketing/sections";
import { ColorScrollPage, BgZone } from "@/components/marketing/color-scroll-page";
import { CardCarousel } from "@/components/marketing/card-carousel";
import {
    HeroCreatorCluster, HeroTrade, PhoneMock, LiveScreen, EarningsCard,
    MiniLive, MiniVerified, MiniFees, StackedCard, BlobArt,
} from "@/components/marketing/mocks";

export const metadata: Metadata = { title: "Creators" };

const FAQ = [
    { q: "How do payouts work?", a: "Fans subscribe or tip in USDC; you claim your balance minus a small platform fee, straight to your wallet." },
    { q: "Do I need special gear to stream?", a: "No. Go live from the app, or plug in OBS on desktop for a full production setup." },
    { q: "What does it cost?", a: "Creating is free. Premium unlocks higher limits, analytics, and the largest reply boost." },
];

export default function CreatorsPage() {
    return (
        <ColorScrollPage className="pt-28 sm:pt-32" initial="var(--color-pastel-yellow)">
            <BgZone bg="var(--color-pastel-yellow)">
                <MarketingHero
                    eyebrow="Creators"
                    title={<>Built for creators</>}
                    sub="Everything you need to go live, grow, and get paid, without leaving the timeline."
                    variant="reverse"
                    ctaLabel="Start creating"
                    secondaryLabel="Launch a coin"
                    secondaryHref="/coins"
                    visual={<HeroCreatorCluster />}
                />

                <TwoUpBold
                    items={[
                        { title: "Go live in seconds", body: "Stream from your phone, chat in real time, and keep every broadcast as a replay.", bg: "bg-soft-pink", visual: <PhoneMock className="w-[180px]"><LiveScreen /></PhoneMock> },
                        { title: "Launch a coin for your people", body: "Give your community a token to rally around, trade it in-app, and earn a fee on every swap.", bg: "bg-black", dark: true, visual: <HeroTrade className="max-w-[300px]" /> },
                    ]}
                />
            </BgZone>

            <BgZone bg="#0e0f13">
                <CardCarousel
                    dark
                    eyebrow="Your toolkit"
                    title="A creator business in one app"
                    sub="Broadcast, verify, and earn — the whole operation lives where your audience already is."
                    cards={[
                        { tone: "bg-soft-pink", node: (<><p className="text-lg font-extrabold tracking-tight text-black">Go live</p><div className="mt-4 flex flex-1 items-center justify-center"><MiniLive /></div></>) },
                        { tone: "bg-white", node: (<><p className="text-lg font-extrabold tracking-tight text-black">Stand out</p><div className="mt-4 flex flex-1 items-center justify-center"><MiniVerified /></div></>) },
                        { tone: "bg-lantern", node: (<><p className="text-lg font-extrabold tracking-tight text-black">Earn on trades</p><div className="mt-4 flex flex-1 items-center justify-center"><MiniFees /></div></>) },
                    ]}
                />
            </BgZone>

            <BgZone bg="var(--color-soft-pink)">
                <InsetBlock
                    reverse
                    eyebrow="Payouts"
                    title="Get paid to create"
                    body="Turn followers into income with subscriptions, tips, and creator fees — all settled in USDC and claimed straight to your wallet."
                    ctaLabel="Start earning"
                    ctaHref="/login"
                    visual={<EarningsCard />}
                />
            </BgZone>

            <BgZone bg="var(--color-soft-gray)">
                <CenterFeature
                    eyebrow="Your community"
                    title="Grow something that's yours"
                    sub="A stage, a timeline, and a wallet in one place — so your audience, your content, and your income all live together."
                    ctaLabel="Start creating"
                    ctaHref="/login"
                    visual={
                        <StackedCard
                            title="Your channel, your coin, your community"
                            art={<BlobArt />}
                            tone="bg-white"
                            sheets={["bg-soft-blue", "bg-pastel-yellow"]}
                        />
                    }
                />

                <ExploreMore currentHref="/creators" />
                <Faq items={FAQ} />
            </BgZone>
        </ColorScrollPage>
    );
}
