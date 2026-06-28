import { Metadata } from "next";
import {
    ShieldKeyIcon, Key01Icon, SecurityLockIcon,
    Shield01Icon, CheckmarkBadge01Icon, SecurityCheckIcon,
} from "@hugeicons/core-free-icons";
import { MarketingHero, CenterFeature, BandSection, ExploreMore, Faq, ClosingCta } from "@/components/marketing/sections";
import { FeatureGrid, type Feature } from "@/components/marketing/feature-card";
import { PhoneMock, WalletScreen, StackedCard, BlobArt, InsetInfoCard } from "@/components/marketing/mocks";

export const metadata: Metadata = { title: "Safety" };

const FEATURES: Feature[] = [
    { icon: ShieldKeyIcon, title: "Swig wallets", body: "Multi-party (FROST) wallets, no seed phrase to lose.", accent: "text-twitter" },
    { icon: Key01Icon, title: "You hold the keys", body: "Non-custodial by design. Your coins stay yours.", accent: "text-jewel" },
    { icon: SecurityLockIcon, title: "Encrypted messages", body: "Direct and group chats are end-to-end encrypted.", accent: "text-pastelred" },
    { icon: Shield01Icon, title: "Scam protection", body: "Built-in checks help you spot and avoid scams.", accent: "text-sunset" },
    { icon: CheckmarkBadge01Icon, title: "Verified badges", body: "Know who you're really talking to.", accent: "text-twitter" },
    { icon: SecurityCheckIcon, title: "Safe by default", body: "Sensible protections on from the first tap.", accent: "text-jewel" },
];

const FAQ = [
    { q: "What is a Swig wallet?", a: "A wallet secured by multi-party (FROST) cryptography, so there's no single seed phrase to lose or leak." },
    { q: "Is watchparty custodial?", a: "No. Wallets are non-custodial, meaning you control your keys and your funds." },
    { q: "Are my messages private?", a: "Yes. Direct and group messages are end-to-end encrypted." },
];

export default function SafetyPage() {
    return (
        <>
            <MarketingHero
                eyebrow="Safety"
                title={<>Your wallet, secured</>}
                sub="Non-custodial wallets, encrypted messages, and scam protection, on by default."
                ctaLabel="Get started"
                secondaryLabel="About us"
                secondaryHref="/about"
                visual={
                    <div className="relative grid place-items-center overflow-hidden rounded-[36px] bg-soft-blue px-6 py-12">
                        <PhoneMock className="rotate-[-3deg]">
                            <WalletScreen />
                        </PhoneMock>
                    </div>
                }
            />

            {/* Big centered stacked card alone on a band — Phantom rhythm. */}
            <CenterFeature
                tone="bg-soft-blue"
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

            {/* A second, differently-sized card — variety down the page. */}
            <CenterFeature
                tone="bg-soft-pink"
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

            {/* Dark inset card on a colored band. */}
            <CenterFeature
                tone="bg-soft-gray"
                title="Your privacy matters"
                visual={
                    <InsetInfoCard
                        icon={ShieldKeyIcon}
                        title="Your privacy matters"
                        body="We never track any personally identifiable information or asset balances. What's yours stays yours."
                        ctaLabel="Read our privacy policy"
                    />
                }
            />

            <BandSection className="bg-white" title="Security you don't think about">
                <FeatureGrid features={FEATURES} />
            </BandSection>

            <ExploreMore currentHref="/safety" className="bg-white" />
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
        </>
    );
}
