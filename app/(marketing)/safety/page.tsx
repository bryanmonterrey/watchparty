import { Metadata } from "next";
import { ShieldKeyIcon } from "@hugeicons/core-free-icons";
import { MarketingHero, CenterFeature, InsetBlock, ExploreMore, Faq } from "@/components/marketing/sections";
import { ColorScrollPage, BgZone } from "@/components/marketing/color-scroll-page";
import { CardCarousel } from "@/components/marketing/card-carousel";
import { SecurityCard, StackedCard, BlobArt, InsetInfoCard, MiniShield, MiniChat, MiniVerified } from "@/components/marketing/mocks";

export const metadata: Metadata = { title: "Safety" };

const FAQ = [
    { q: "What is a Swig wallet?", a: "A wallet secured by multi-party (FROST) cryptography, so there's no single seed phrase to lose or leak." },
    { q: "Is watchparty custodial?", a: "No. Wallets are non-custodial, meaning you control your keys and your funds." },
    { q: "Are my messages private?", a: "Yes. Direct and group messages are end-to-end encrypted." },
];

export default function SafetyPage() {
    return (
        <ColorScrollPage className="pt-28 sm:pt-32" initial="var(--color-soft-blue)">
            <BgZone bg="var(--color-soft-blue)">
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
            </BgZone>

            <BgZone bg="#0e0f13">
                <CardCarousel
                    dark
                    eyebrow="On by default"
                    title="Security you don't think about"
                    sub="The safe choice is the default — no settings to hunt for, no homework."
                    cards={[
                        { tone: "bg-soft-blue", node: (<><p className="text-lg font-extrabold tracking-tight text-black">Swig wallets</p><div className="mt-4 flex flex-1 items-center justify-center"><MiniShield /></div></>) },
                        { tone: "bg-white", node: (<><p className="text-lg font-extrabold tracking-tight text-black">Encrypted messages</p><div className="mt-4 flex flex-1 items-center justify-center"><MiniChat /></div></>) },
                        { tone: "bg-soft-pink", node: (<><p className="text-lg font-extrabold tracking-tight text-black">Verified & protected</p><div className="mt-4 flex flex-1 items-center justify-center"><MiniVerified /></div></>) },
                    ]}
                />
            </BgZone>

            <BgZone bg="var(--color-soft-gray)">
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
            </BgZone>

            <BgZone bg="var(--color-soft-pink)">
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
            </BgZone>
        </ColorScrollPage>
    );
}
