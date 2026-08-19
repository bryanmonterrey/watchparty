import { Metadata } from "next";
import { MarketingHero, BigStatement, FeatureLedger, InsetBlock } from "@/components/marketing/sections";
import { ColorScrollPage, BgZone } from "@/components/marketing/color-scroll-page";
import { EarningsCard } from "@/components/marketing/mocks";

export const metadata: Metadata = {
    title: "Investors",
    description: "Invest in watchparty.",
};

// The investors page: deliberately the QUIETEST marketing page — a thesis, the
// facts of what's built, and a way to reach us. No metrics are quoted anywhere
// on it by design: pre-launch numbers would either be zero or invented, and an
// investor page that overclaims is worse than none. Add real traction figures
// only when they exist.
//
// Reachable signed-in via APP_REACHABLE in (marketing)/layout.tsx — it's
// linked from the app's rail footer, same as /about.

export default function InvestorsPage() {
    return (
        <ColorScrollPage className="pt-28 sm:pt-32" initial="var(--color-pastel-yellow)">
            <BgZone bg="var(--color-pastel-yellow)">
                <MarketingHero
                    variant="centered"
                    eyebrow="Investors"
                    title={<>Own a piece of the party</>}
                    sub="The timeline, the stream, and the wallet, converging into one consumer app."
                    ctaLabel="Get in touch"
                    ctaHref="mailto:invest@watchparty.xyz"
                    secondaryLabel="About us"
                    secondaryHref="/about"
                    visual={<EarningsCard />}
                />

                <BigStatement>
                    Social apps monetize attention with ads. watchparty monetizes it with{" "}
                    <span className="text-black/40">rails</span> — subscriptions, creator
                    payouts, and trading settle in USDC inside the app, so the business earns
                    when creators and traders do, not just when advertisers show up.
                </BigStatement>
            </BgZone>

            <BgZone bg="var(--color-soft-gray)">
                <FeatureLedger
                    rows={[
                        { title: "Built, not pitched", body: "Live streaming, the social feed, non-custodial multichain wallets, coin launches, and USDC subscriptions are shipped and running in production." },
                        { title: "Revenue on every rail", body: "Platform premium tiers, a 5% fee on creator subscriptions, trading fees, and a prepaid ads system — four independent revenue lines in one product." },
                        { title: "A developer surface", body: "An OAuth identity platform, public APIs, and bot accounts turn the product into ground other people build on." },
                    ]}
                />
            </BgZone>

            <BgZone bg="var(--color-soft-blue)">
                <InsetBlock
                    title="Talk to us"
                    body="We're raising from people who understand consumer crypto. If that's you, write to us — a deck and a live walkthrough are one reply away."
                    ctaLabel="invest@watchparty.xyz"
                    ctaHref="mailto:invest@watchparty.xyz"
                    visual={<EarningsCard />}
                />
            </BgZone>
        </ColorScrollPage>
    );
}
