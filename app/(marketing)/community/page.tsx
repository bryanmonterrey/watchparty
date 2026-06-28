import { Metadata } from "next";
import {
    UserGroupIcon, Mic01Icon, Chatting01Icon,
    AiMagicIcon, SecurityCheckIcon, Compass01Icon,
} from "@hugeicons/core-free-icons";
import { MarketingHero, ShowcaseRow, BandSection, Faq, ClosingCta } from "@/components/marketing/sections";
import { FeatureGrid, type Feature } from "@/components/marketing/feature-card";

export const metadata: Metadata = { title: "Communities" };

const FEATURES: Feature[] = [
    { icon: UserGroupIcon, title: "Servers", body: "Channels for everything your community is into.", accent: "text-twitter" },
    { icon: Mic01Icon, title: "Live spaces", body: "Drop into live audio rooms with your people.", accent: "text-pastelred" },
    { icon: Chatting01Icon, title: "Group chats", body: "Direct, encrypted conversations with the crew.", accent: "text-jewel" },
    { icon: AiMagicIcon, title: "Bots", body: "Discord-style automation and integrations.", accent: "text-sunset" },
    { icon: SecurityCheckIcon, title: "Moderation", body: "Roles, mods, and tools to keep it healthy.", accent: "text-twitter" },
    { icon: Compass01Icon, title: "Discover", body: "Find communities built around what you love.", accent: "text-pastelred" },
];

const FAQ = [
    { q: "How are communities different from group chats?", a: "Group chats are private threads; communities are full servers with channels, roles, live spaces, and bots." },
    { q: "Can I add bots?", a: "Yes. Communities support Discord-style bots for automation, moderation, and integrations." },
    { q: "Are messages private?", a: "Direct and group messages are end-to-end encrypted." },
];

export default function CommunityPage() {
    return (
        <>
            <MarketingHero
                eyebrow="Communities"
                title={<>Find your people</>}
                sub="Servers, live spaces, group chats, and bots, for the communities you actually care about."
                ctaLabel="Join a community"
                secondaryLabel="Explore"
                secondaryHref="/explore"
                panelTone="bg-soft-pink"
                panelLabel="Communities"
            />
            <ShowcaseRow
                title="More than a group chat"
                body="Full servers with channels, roles, and live audio spaces, the place your community actually lives."
                panelTone="bg-soft-blue"
                panelLabel="Server view"
            />
            <ShowcaseRow
                reverse
                title="Automate the boring parts"
                body="Add Discord-style bots for moderation, welcomes, and integrations, so you can focus on the people."
                panelTone="bg-pastel-yellow"
                panelLabel="Bots"
            />
            <BandSection className="bg-white" title="Built for belonging">
                <FeatureGrid features={FEATURES} />
            </BandSection>
            <Faq items={FAQ} />
            <ClosingCta title="Build your community" sub="Your people are already here." ctaLabel="Get started" />
        </>
    );
}
