import { Metadata } from "next";
import { LiveStreaming01Icon, Wallet01Icon, UserGroupIcon } from "@hugeicons/core-free-icons";
import { MarketingHero, ShowcaseRow, BandSection, ExploreMore, Faq, ClosingCta } from "@/components/marketing/sections";
import { FeatureGrid, type Feature } from "@/components/marketing/feature-card";

export const metadata: Metadata = { title: "About" };

const PILLARS: Feature[] = [
    { icon: LiveStreaming01Icon, title: "A stage", body: "Go live and stream to an audience that's already here.", accent: "text-pastelred" },
    { icon: UserGroupIcon, title: "A timeline", body: "The social feed you know, ranked by an open algorithm.", accent: "text-twitter" },
    { icon: Wallet01Icon, title: "A wallet", body: "Trade, tip, and get paid, built into every account.", accent: "text-jewel" },
];

const FAQ = [
    { q: "What is watchparty?", a: "A single app where the timeline, live streaming, and a crypto wallet finally live together." },
    { q: "Who is it for?", a: "Creators and communities who want to watch, post, stream, and trade in one place." },
    { q: "What makes it different?", a: "The same algorithm you love, now with a stage to perform on and a wallet to get paid through." },
];

export default function AboutPage() {
    return (
        <>
            <MarketingHero
                eyebrow="About"
                title={<>Crypto Twitter, leveled up</>}
                sub="watchparty brings the timeline, the stream, and the trade together in one app."
                secondaryLabel="Explore"
                secondaryHref="/explore"
                panelTone="bg-pastel-yellow"
                panelLabel="watchparty"
                panelIcon={LiveStreaming01Icon}
            />
            <ShowcaseRow
                title="The timeline you know"
                body="Same feed, same open algorithm, now with a stage to go live on and a wallet to get paid through."
                panelTone="bg-soft-pink"
                panelLabel="Timeline"
                panelIcon={UserGroupIcon}
            />
            <ShowcaseRow
                reverse
                title="No more tab-switching"
                body="Watch a stream, post a take, back a creator, and trade a coin, all without leaving the app."
                panelTone="bg-soft-blue"
                panelLabel="One app"
                panelIcon={Wallet01Icon}
            />
            <BandSection className="bg-white" title="Three things, one app">
                <FeatureGrid features={PILLARS} />
            </BandSection>
            <ExploreMore currentHref="/about" className="bg-white" />
            <Faq items={FAQ} />
            <ClosingCta
                title="Come hang out"
                sub="The whole show, in one place."
                tiles={[
                    { title: "Watch", body: "Streams, shorts, and your timeline." },
                    { title: "Create", body: "Go live and get paid in USDC." },
                    { title: "Own", body: "A wallet built into every account." },
                ]}
            />
        </>
    );
}
