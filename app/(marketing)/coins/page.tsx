import { Metadata } from "next";
import {
    Rocket01Icon, Analytics01Icon, DollarCircleIcon,
    Wallet01Icon, UserGroupIcon, Coins01Icon,
} from "@hugeicons/core-free-icons";
import { MarketingHero, ShowcaseRow, BandSection, ExploreMore, Faq, ClosingCta } from "@/components/marketing/sections";
import { FeatureGrid, type Feature } from "@/components/marketing/feature-card";

export const metadata: Metadata = { title: "Coins" };

const FEATURES: Feature[] = [
    { icon: Rocket01Icon, title: "Launch in a tap", body: "Spin up a token for your content or community instantly.", accent: "text-pastelred" },
    { icon: Analytics01Icon, title: "Trade in-app", body: "Buy and sell without leaving the app.", accent: "text-twitter" },
    { icon: DollarCircleIcon, title: "Earn creator fees", body: "Take a cut of every trade on your coin.", accent: "text-sunset" },
    { icon: Wallet01Icon, title: "Wallet built in", body: "A secure wallet ships with every account.", accent: "text-jewel" },
    { icon: UserGroupIcon, title: "Your community's coin", body: "Give your audience a token to rally around.", accent: "text-twitter" },
    { icon: Coins01Icon, title: "Fair launch", body: "Bonding-curve pricing, transparent from the first buy.", accent: "text-pastelred" },
];

const FAQ = [
    { q: "What chain are coins on?", a: "Coins launch on Solana, with trading and fees handled in-app." },
    { q: "How do creator fees work?", a: "You set a creator fee that's taken on each trade and routed to your wallet automatically." },
    { q: "Is there a wallet included?", a: "Yes. Every account ships with a secure wallet, so you can launch and trade right away." },
];

export default function CoinsPage() {
    return (
        <>
            <MarketingHero
                eyebrow="Coins"
                title={<>Launch a coin in a tap</>}
                sub="Give your community a token, trade it in-app, and earn on every swap."
                ctaLabel="Launch a coin"
                secondaryLabel="For creators"
                secondaryHref="/creators"
                panelTone="bg-soft-blue"
                panelLabel="Token launch"
                panelIcon={Rocket01Icon}
            />
            <ShowcaseRow
                title="Your community, tokenized"
                body="Name it, pick an image, and launch on a fair bonding curve. We handle the on-chain setup."
                panelTone="bg-pastel-yellow"
                panelLabel="Launch flow"
                panelIcon={Coins01Icon}
            />
            <ShowcaseRow
                reverse
                title="Trade without leaving"
                body="Buy, sell, and track your coins in-app, with a secure wallet built into every account."
                panelTone="bg-soft-pink"
                panelLabel="Trade view"
                panelIcon={Analytics01Icon}
            />
            <BandSection className="bg-white" title="Tokens, made simple">
                <FeatureGrid features={FEATURES} />
            </BandSection>
            <ExploreMore currentHref="/coins" className="bg-white" />
            <Faq items={FAQ} />
            <ClosingCta
                title="Launch your coin"
                sub="Your community's token is one tap away."
                ctaLabel="Launch a coin"
                tiles={[
                    { title: "One tap", body: "Launch on a fair bonding curve." },
                    { title: "Earn fees", body: "Take a cut of every trade." },
                    { title: "Built-in wallet", body: "Trade right from your account." },
                ]}
            />
        </>
    );
}
