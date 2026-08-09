import { Metadata } from "next";
import { MarketingHero, BentoGrid, TwoUpBold, StepFlow, Faq, ClosingCta } from "@/components/marketing/sections";
import { ColorScrollPage, BgZone } from "@/components/marketing/color-scroll-page";
import { Reveal } from "@/components/marketing/motion";
import {
    HeroApiMock, ChallengeCard, CoinCard, CurlCard, FeedCard, LiveCard, SettleCard,
} from "@/components/developer/dev-mocks";
import { PricingCalculator } from "@/components/developer/pricing-calculator";
import { FlashIcon, CoinsDollarIcon, Key01Icon, Robot01Icon } from "@hugeicons/core-free-icons";

export const metadata: Metadata = { title: "Developers" };

// The developer landing — X's developer-console page anatomy (hero →
// pay-per-use benefits → response wall → usage calculator → model comparison →
// CTA), rebuilt in watchparty's identity: pastel bands, big Geist headlines,
// pill CTAs, dark code cards with the lantern accent.

const FAQ = [
    { q: "What does it cost?", a: "Priced per surface, from $0.001 a call — cached coin reads are cheapest, upstream-metered calls like RPC and link previews cost more. Paid from a USDC credit balance; 1 credit = $1. No monthly fee, no minimum, no caps." },
    { q: "Is using the app billed?", a: "No. Browsing, the mobile app, embeds, and anything a signed-in user does is free — billing only applies to programmatic callers hitting the API from outside the app." },
    { q: "What is x402?", a: "An open standard built on HTTP 402. Call without a key and the response is a payment challenge; retry with a signed USDC payment in the X-PAYMENT header and the request settles on-chain — no account needed." },
    { q: "How do I get credits?", a: "Create a key in the console, then fund it. Self-serve funding in USDC is on the way; until then keys are funded on request." },
    { q: "Where do I get help?", a: "The docs cover auth, pricing, and errors. For anything else, reach out from your account and mention your key prefix — never the full key." },
];

function ResponseWall() {
    return (
        <section className="flex min-h-[92svh] flex-col justify-center px-6 py-12">
            <div className="mx-auto w-full max-w-6xl">
                <Reveal className="max-w-3xl">
                    <h2 className="font-extrabold text-3xl leading-[1.06] tracking-tight text-black sm:text-5xl lg:text-6xl">
                        Real responses, lightning quick
                    </h2>
                    <p className="mt-4 max-w-xl text-lg font-semibold leading-snug text-black/60">
                        Streams, coins, and markets straight from the app — one header away. No key? The response is a payment challenge, not a dead end.
                    </p>
                </Reveal>
                <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Reveal delay={0}><CurlCard /></Reveal>
                    <Reveal delay={0.06}><FeedCard /></Reveal>
                    <Reveal delay={0.12}><LiveCard /></Reveal>
                    <Reveal delay={0.18}><ChallengeCard /></Reveal>
                    <Reveal delay={0.24}><SettleCard /></Reveal>
                    <Reveal delay={0.3}><CoinCard /></Reveal>
                </div>
            </div>
        </section>
    );
}

function CalculatorSection() {
    return (
        <section className="flex min-h-[92svh] flex-col justify-center px-6 py-12">
            <div className="mx-auto w-full max-w-6xl">
                <Reveal className="max-w-3xl">
                    <h2 className="font-extrabold text-3xl leading-[1.06] tracking-tight text-black sm:text-5xl lg:text-6xl">
                        Price out your usage
                    </h2>
                    <p className="mt-4 max-w-xl text-lg font-semibold leading-snug text-black/60">
                        Priced per surface, and the sheet below is the same one the gate bills from. Drag the sliders — the total is the whole bill.
                    </p>
                </Reveal>
                <Reveal delay={0.1} className="mt-14">
                    <PricingCalculator />
                </Reveal>
            </div>
        </section>
    );
}

export default function DeveloperPage() {
    return (
        <ColorScrollPage className="pt-28 sm:pt-32" initial="var(--color-soft-blue)">
            <BgZone bg="var(--color-soft-blue)">
                <MarketingHero
                    eyebrow="Developers"
                    title={<>Build on watchparty</>}
                    sub="One API for streams, coins, and markets. Pay per request in USDC — no monthly fees, no caps, no waiting for approval."
                    ctaLabel="Open the console"
                    ctaHref="/developer/console"
                    secondaryLabel="Read the docs"
                    secondaryHref="/developer/docs"
                    visual={<HeroApiMock />}
                />

                <BentoGrid
                    title="Pay for what you use"
                    sub="Consumption-based from the first request — the meter is the whole pricing model."
                    items={[
                        { icon: FlashIcon, title: "No monthly fees", body: "No tiers, no seats, no minimum spend. Your usage is your bill — priced per surface from $0.001 a call, and a rejected request costs nothing.", bg: "bg-white", accent: "text-black", span: "big" },
                        { icon: CoinsDollarIcon, title: "Credits in USDC", body: "1 credit = $1, settled on Solana. Fund a key and start calling.", bg: "bg-pastel-yellow", accent: "text-black" },
                        { icon: Key01Icon, title: "One header", body: "Send x-api-key. No OAuth dance, no app review.", bg: "bg-soft-pink", accent: "text-black" },
                        { icon: Robot01Icon, title: "Built for agents", body: "x402-native: agents can pay per request on-chain with no account at all.", bg: "bg-black", accent: "text-lantern", span: "wide" },
                    ]}
                />
            </BgZone>

            <BgZone bg="var(--color-soft-gray)">
                <ResponseWall />
                <CalculatorSection />
            </BgZone>

            <BgZone bg="var(--color-soft-pink)">
                <TwoUpBold
                    items={[
                        {
                            title: "Keys for builders",
                            body: "Create a key, fund it with credits, and ship. Balances, spend, and revocation live in the console — rotate in one click.",
                            bg: "bg-white",
                            visual: <CurlCard className="max-w-[400px]" />,
                        },
                        {
                            title: "x402 for agents",
                            body: "No signup, no key. A bare request gets a 402 with payment terms; pay in USDC on the retry and it settles on-chain.",
                            bg: "bg-black",
                            dark: true,
                            visual: <SettleCard className="max-w-[400px]" />,
                        },
                    ]}
                />

                <StepFlow
                    title="Start in three steps"
                    steps={[
                        { title: "Create a key", body: "Open the console and name a key. The secret is shown once — store it well." },
                        { title: "Fund it", body: "Load credits in USDC. A dollar is a thousand requests." },
                        { title: "Call anything", body: "Send x-api-key with any API request. That's the whole integration." },
                    ]}
                />

                <Faq items={FAQ} />
            </BgZone>

            <BgZone bg="var(--color-soft-gray)">
                <ClosingCta
                    title="Ready to build?"
                    sub="Create a key and make your first call in the next five minutes."
                    ctaLabel="Open the console"
                    ctaHref="/developer/console"
                    tiles={[
                        { title: "From $0.001", body: "Per-surface pricing that matches what a call actually costs to serve." },
                        { title: "USDC-settled", body: "Credits are dollars on-chain, not points in a dashboard." },
                        { title: "x402-native", body: "The first social API where an agent can pay its own way." },
                    ]}
                />
            </BgZone>
        </ColorScrollPage>
    );
}
