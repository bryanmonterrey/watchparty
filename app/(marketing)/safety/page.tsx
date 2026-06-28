import { Metadata } from "next";
import {
    ShieldKeyIcon, Key01Icon, SecurityLockIcon,
    Shield01Icon, CheckmarkBadge01Icon, SecurityCheckIcon,
} from "@hugeicons/core-free-icons";
import { MarketingHero, BandSection, StepRow, Faq, ClosingCta } from "@/components/marketing/sections";
import { FeatureGrid, type Feature } from "@/components/marketing/feature-card";

export const metadata: Metadata = { title: "Safety" };

const FEATURES: Feature[] = [
    { icon: ShieldKeyIcon, title: "Swig wallets", body: "Multi-party (FROST) wallets, no seed phrase to lose.", accent: "text-twitter" },
    { icon: Key01Icon, title: "You hold the keys", body: "Non-custodial by design. Your coins stay yours.", accent: "text-jewel" },
    { icon: SecurityLockIcon, title: "Encrypted messages", body: "Direct and group chats are end-to-end encrypted.", accent: "text-pastelred" },
    { icon: Shield01Icon, title: "Scam protection", body: "Built-in checks help you spot and avoid scams.", accent: "text-sunset" },
    { icon: CheckmarkBadge01Icon, title: "Verified badges", body: "Know who you're really talking to.", accent: "text-twitter" },
    { icon: SecurityCheckIcon, title: "Safe by default", body: "Sensible protections on from the first tap.", accent: "text-jewel" },
];

const STEPS = [
    { title: "Sign in safely", body: "No seed phrase to leak; your wallet is secured by multi-party keys." },
    { title: "Stay protected", body: "Scam checks and verified badges work quietly in the background." },
    { title: "Stay in control", body: "It's non-custodial, so your funds are always yours to move." },
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
            />
            <BandSection className="bg-white" title="Security you don't think about">
                <FeatureGrid features={FEATURES} />
            </BandSection>
            <BandSection title="How it works">
                <StepRow steps={STEPS} />
            </BandSection>
            <Faq items={FAQ} className="bg-white" />
            <ClosingCta title="Safe from the start" sub="Real security, none of the homework." />
        </>
    );
}
