import { Metadata } from "next";
import { MarketingHero, TwoUpBold, FeatureLedger, PosterPanel, ExploreMore, Faq } from "@/components/marketing/sections";
import { ColorScrollPage, BgZone } from "@/components/marketing/color-scroll-page";
import {
    HeroCreatorCluster, HeroTrade, PhoneMock, LiveScreen, EarningsCard,
    MiniLive, MiniVerified, MiniFees,
} from "@/components/marketing/mocks";

export const metadata: Metadata = { title: "Creators" };

// The business page: reverse hero, two bold panels, an editorial ledger of the
// toolkit, and a dark payout poster. No carousel here on purpose; the ledger
// carries the toolkit beat.

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

            <BgZone bg="var(--color-soft-pink)">
                <FeatureLedger
                    title="A creator business in one app"
                    rows={[
                        { title: "Go live", body: "Broadcast from your pocket with chat from the first viewer.", visual: <MiniLive /> },
                        { title: "Stand out", body: "Get verified and let your work carry the badge everywhere.", visual: <MiniVerified /> },
                        { title: "Earn on trades", body: "Set a creator fee and take a cut of every swap on your coin.", visual: <MiniFees /> },
                    ]}
                />
            </BgZone>

            <BgZone bg="var(--color-soft-gray)">
                <PosterPanel
                    title="Get paid to create"
                    body="Subscriptions, tips, and creator fees, all settled in USDC and claimed straight to your wallet. The platform takes a flat 5%, nothing more."
                    ctaLabel="Start earning"
                    ctaHref="/login"
                    visual={<EarningsCard />}
                />

                <ExploreMore currentHref="/creators" />
                <Faq items={FAQ} />
            </BgZone>
        </ColorScrollPage>
    );
}
