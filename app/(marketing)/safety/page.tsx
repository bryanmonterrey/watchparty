import { Metadata } from "next";
import { ShieldKeyIcon } from "@hugeicons/core-free-icons";
import { MarketingHero, CenterFeature, CaptionCards, InsetBlock, ExploreMore, Faq, ClosingCta } from "@/components/marketing/sections";
import { GradientPage } from "@/components/marketing/gradient-page";
import { SecurityCard, StackedCard, BlobArt, InsetInfoCard, MiniShield, MiniChat, MiniVerified } from "@/components/marketing/mocks";

export const metadata: Metadata = { title: "Safety" };

const FAQ = [
    { q: "What is a Swig wallet?", a: "A wallet secured by multi-party (FROST) cryptography, so there's no single seed phrase to lose or leak." },
    { q: "Is watchparty custodial?", a: "No. Wallets are non-custodial, meaning you control your keys and your funds." },
    { q: "Are my messages private?", a: "Yes. Direct and group messages are end-to-end encrypted." },
];

export default function SafetyPage() {
    return (
        <GradientPage
            className="pt-28 sm:pt-32"
            stops={[
                "var(--color-soft-blue)",
                "var(--color-soft-gray) 40%",
                "var(--color-soft-pink) 74%",
                "#ffffff",
            ]}
        >
            <MarketingHero
                variant="reverse"
                eyebrow="Safety"
                title={<>Your wallet, secured</>}
                sub="Non-custodial wallets, encrypted messages, and scam protection, on by default."
                ctaLabel="Get started"
                secondaryLabel="About us"
                secondaryHref="/about"
                visual={
                    <div className="grid place-items-center rounded-[36px] bg-white/50 px-6 py-14 ring-1 ring-black/[0.04]">
                        <SecurityCard />
                    </div>
                }
            />

            {/* Big centered stacked card alone — Phantom rhythm, on the gradient. */}
            <CenterFeature
                title={<>We&apos;ve got your back, always</>}
                sub="Self-custodial means you control your funds. We never have access."
                visual={
                    <StackedCard
                        title="Self-custodial means you control your funds. We never have access."
                        art={<BlobArt />}
                        sheets={["bg-pastelred/40", "bg-lantern/50"]}
                    />
                }
            />

            <CaptionCards
                eyebrow="On by default"
                title="Security you don't think about"
                sub="The safe choice is the default — no settings to hunt for, no homework."
                cards={[
                    { visual: <MiniShield />, bg: "bg-white", title: "Swig wallets", body: "Multi-party (FROST) keys — non-custodial, with no seed phrase to lose." },
                    { visual: <MiniChat />, bg: "bg-white", title: "Encrypted messages", body: "Direct and group chats are end-to-end encrypted by default." },
                    { visual: <MiniVerified />, bg: "bg-white", title: "Verified & protected", body: "Verified badges and built-in scam checks so you know who's real." },
                ]}
            />

            {/* Dark inset card floating on the gradient. */}
            <InsetBlock
                eyebrow="Privacy"
                title="Your privacy matters"
                body="We never track any personally identifiable information or asset balances. What's yours stays yours — on-chain and off."
                ctaLabel="Read our privacy policy"
                ctaHref="/about"
                visual={
                    <InsetInfoCard
                        icon={ShieldKeyIcon}
                        title="Nothing to track"
                        body="No personal data, no asset-balance snooping. Your activity is yours."
                    />
                }
            />

            {/* A second, differently-sized stacked card — variety down the page. */}
            <CenterFeature
                title="Spam, gone for good"
                sub="Burn unwanted spam tokens and NFTs in a tap, your wallet stays clean."
                visual={
                    <StackedCard
                        tone="bg-lantern/30"
                        sheets={["bg-white", "bg-soft-blue"]}
                        className="w-[260px] sm:w-[300px]"
                        title="Burn unwanted spam NFTs for good."
                    />
                }
            />

            <ExploreMore currentHref="/safety" />
            <Faq items={FAQ} />
            <ClosingCta
                title="Safe from the start"
                sub="Real security, none of the homework."
                tiles={[
                    { title: "Non-custodial", body: "Your keys, your coins." },
                    { title: "No seed phrase", body: "Swig multi-party wallets." },
                    { title: "Encrypted", body: "Messages are end-to-end." },
                ]}
            />
        </GradientPage>
    );
}
