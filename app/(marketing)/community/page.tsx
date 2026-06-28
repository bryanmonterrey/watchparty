import { Metadata } from "next";
import {
    UserGroupIcon, Mic01Icon, Chatting01Icon,
    AiMagicIcon, SecurityCheckIcon, Compass01Icon,
} from "@hugeicons/core-free-icons";
import { MarketingHero, BandSection, StepRow, Faq, ClosingCta } from "@/components/marketing/sections";
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

const STEPS = [
    { title: "Start a server", body: "Create channels for chat, voice, and announcements." },
    { title: "Invite your people", body: "Share a link and bring your community over." },
    { title: "Bring it to life", body: "Add bots, host live spaces, and set up roles." },
];

const FAQ = [
    { q: "How are communities different from group chats?", a: "Group chats are private threads; communities are full servers with channels, roles, live spaces, and bots." },
    { q: "Can I add bots?", a: "Yes. Communities support Discord-style bots for automation, moderation, and integrations." },
    { q: "Are messages private?", a: "Direct and group messages are end-to-end encrypted." },
];

export default function CommunitiesPage() {
    return (
        <>
            <MarketingHero
                eyebrow="Communities"
                title={<>Find your people</>}
                sub="Servers, live spaces, group chats, and bots, for the communities you actually care about."
                ctaLabel="Join a community"
                secondaryLabel="Explore"
                secondaryHref="/explore"
            />
            <BandSection className="bg-white" title="More than a group chat">
                <FeatureGrid features={FEATURES} />
            </BandSection>
            <BandSection title="How it works">
                <StepRow steps={STEPS} />
            </BandSection>
            <Faq items={FAQ} className="bg-white" />
            <ClosingCta title="Build your community" sub="Your people are already here." ctaLabel="Get started" />
        </>
    );
}
