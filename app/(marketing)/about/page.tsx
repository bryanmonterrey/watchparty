import { Metadata } from "next";
import { MarketingHero, BigStatement, FeatureLedger, InsetBlock, ExploreMore, Faq } from "@/components/marketing/sections";
import { ColorScrollPage, BgZone } from "@/components/marketing/color-scroll-page";
import { CardCarousel } from "@/components/marketing/card-carousel";
import { HeroBento, EarningsCard, MiniLive, MiniFeed, MiniChart } from "@/components/marketing/mocks";

export const metadata: Metadata = { title: "About" };

// The manifesto page: centered hero, word-reveal statement, the card spread,
// then an editorial ledger. Spine is deliberately different from every other
// marketing page.

const FAQ = [
    { q: "What is watchparty?", a: "A single app where the timeline, live streaming, and a crypto wallet finally live together." },
    { q: "Who is it for?", a: "Creators and communities who want to watch, post, stream, and trade in one place." },
    { q: "What makes it different?", a: "The same algorithm you love, now with a stage to perform on and a wallet to get paid through." },
];

export default function AboutPage() {
    return (
        <ColorScrollPage className="pt-28 sm:pt-32" initial="var(--color-soft-pink)">
            <BgZone bg="var(--color-soft-pink)">
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
                    entirely. <span className="text-black/40">watchparty puts them in the same place.</span> Watch a
                    stream, post a take, back a creator, and trade a coin without ever switching tabs.
                </BigStatement>
            </BgZone>

            <BgZone bg="#0e0f13">
                <CardCarousel
                    dark
                    title="Watch, post, and trade together"
                    sub="The three things you'd juggle across apps, sharing a single feed."
                    cards={[
                        { tone: "bg-soft-pink", node: (<><p className="text-lg font-extrabold tracking-tight text-black">A stage</p><div className="mt-4 flex flex-1 items-center justify-center"><MiniLive /></div></>) },
                        { tone: "bg-white", node: (<><p className="text-lg font-extrabold tracking-tight text-black">A timeline</p><div className="mt-4 flex flex-1 items-center justify-center"><MiniFeed /></div></>) },
                        { tone: "bg-soft-blue", node: (<><p className="text-lg font-extrabold tracking-tight text-black">A wallet</p><div className="mt-4 flex flex-1 items-center justify-center"><MiniChart /></div></>) },
                    ]}
                />
            </BgZone>

            <BgZone bg="var(--color-pastel-yellow)">
                <FeatureLedger
                    rows={[
                        { title: "A stage", body: "Go live and stream to an audience that's already here, no second app required." },
                        { title: "A timeline", body: "The social feed you know, ranked by an open algorithm you can actually read." },
                        { title: "A wallet", body: "Trade, tip, and get paid, built into every account from day one." },
                    ]}
                />
            </BgZone>

            <BgZone bg="var(--color-soft-gray)">
                <InsetBlock
                    reverse
                    title="Get paid for what you make"
                    body="Creators earn from subscriptions, tips, and creator fees, settled in USDC and claimed straight to a wallet built into every account."
                    ctaLabel="Start creating"
                    ctaHref="/creators"
                    visual={<EarningsCard />}
                />

                <ExploreMore currentHref="/about" />
                <Faq items={FAQ} />
            </BgZone>
        </ColorScrollPage>
    );
}
