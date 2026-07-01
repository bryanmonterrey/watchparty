import { Metadata } from "next";
import { LiveStreaming01Icon, Wallet01Icon, UserGroupIcon } from "@hugeicons/core-free-icons";
import { MarketingHero, BigStatement, StepFlow, CaptionCards, InsetBlock, ExploreMore, Faq, ClosingCta } from "@/components/marketing/sections";
import { GradientPage } from "@/components/marketing/gradient-page";
import { HeroBento, EarningsCard, MiniLive, MiniFeed, MiniChart } from "@/components/marketing/mocks";

export const metadata: Metadata = { title: "About" };

const PILLARS = [
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
        <GradientPage
            className="pt-28 sm:pt-32"
            stops={[
                "var(--color-soft-pink)",
                "var(--color-pastel-yellow) 38%",
                "var(--color-soft-blue) 72%",
                "var(--color-soft-gray)",
            ]}
        >
            <MarketingHero
                variant="centered"
                eyebrow="About"
                title={<>Crypto Twitter, leveled up</>}
                sub="watchparty brings the timeline, the stream, and the trade together in one app."
                secondaryLabel="Explore"
                secondaryHref="/explore"
                visual={<HeroBento />}
            />

            <BigStatement>
                The timeline lives in one app, streaming in another, and your wallet somewhere else
                entirely. <span className="text-black/40">watchparty puts them in the same place</span> — watch a
                stream, post a take, back a creator, and trade a coin without ever switching tabs.
            </BigStatement>

            <StepFlow
                eyebrow="The idea"
                title="Three things, one app"
                sub="A stage, a timeline, and a wallet — finally in the same place."
                steps={PILLARS.map((p) => ({ title: p.title, body: p.body }))}
            />

            <CaptionCards
                eyebrow="See it"
                title="Watch, post, and trade — side by side"
                sub="The three things you'd juggle across apps, sharing a single feed."
                cards={[
                    { visual: <MiniLive />, bg: "bg-white", title: "A stage", body: "Go live and stream to an audience that's already here." },
                    { visual: <MiniFeed />, bg: "bg-white", title: "A timeline", body: "The social feed you know, ranked by an open algorithm." },
                    { visual: <MiniChart />, bg: "bg-white", title: "A wallet", body: "Trade, tip, and get paid — built into every account." },
                ]}
            />

            <InsetBlock
                reverse
                eyebrow="For creators"
                title="Get paid for what you make"
                body="Creators earn from subscriptions, tips, and creator fees — settled in USDC and claimed straight to a wallet built into every account."
                ctaLabel="Start creating"
                ctaHref="/creators"
                visual={<EarningsCard />}
            />

            <ExploreMore currentHref="/about" />
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
        </GradientPage>
    );
}
