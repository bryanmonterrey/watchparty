import { Metadata } from "next";
import {
    UserGroupIcon, Mic01Icon, Chatting01Icon,
    AiMagicIcon, SecurityCheckIcon, Compass01Icon,
} from "@hugeicons/core-free-icons";
import { MarketingHero, CaptionCards, BentoGrid, InsetBlock, ExploreMore, Faq, ClosingCta } from "@/components/marketing/sections";
import { GradientPage } from "@/components/marketing/gradient-page";
import { type Feature } from "@/components/marketing/feature-card";
import { MiniServer, MiniSpace, MiniChat } from "@/components/marketing/mocks";

export const metadata: Metadata = { title: "Communities" };

const FEATURES: Feature[] = [
    { icon: UserGroupIcon, title: "Servers", body: "Channels for everything your community is into.", accent: "text-twitter" },
    { icon: Mic01Icon, title: "Live spaces", body: "Drop into live audio rooms with your people.", accent: "text-pastelred" },
    { icon: Chatting01Icon, title: "Group chats", body: "Direct, encrypted conversations with the crew.", accent: "text-jewel" },
    { icon: AiMagicIcon, title: "Bots", body: "Discord-style automation and integrations.", accent: "text-sunset" },
    { icon: SecurityCheckIcon, title: "Moderation", body: "Roles, mods, and tools to keep it healthy.", accent: "text-twitter" },
    { icon: Compass01Icon, title: "Discover", body: "Find communities built around what you love.", accent: "text-pastelred" },
];

const BENTO_STYLE = [
    { bg: "bg-white", accent: "text-twitter", span: "big" },
    { bg: "bg-white", accent: "text-pastelred" },
    { bg: "bg-white", accent: "text-jewel" },
    { bg: "bg-white", accent: "text-sunset", span: "wide" },
    { bg: "bg-white", accent: "text-twitter", span: "wide" },
    { bg: "bg-white", accent: "text-pastelred", span: "wide" },
] as const;

const BOTS = [
    ["Welcome bot", "Greets new members and assigns roles."],
    ["Mod bot", "Auto-moderation, filters, and slow mode."],
    ["Drop bot", "Token-gated perks and giveaways."],
];

const FAQ = [
    { q: "How are communities different from group chats?", a: "Group chats are private threads; communities are full servers with channels, roles, live spaces, and bots." },
    { q: "Can I add bots?", a: "Yes. Communities support Discord-style bots for automation, moderation, and integrations." },
    { q: "Are messages private?", a: "Direct and group messages are end-to-end encrypted." },
];

export default function CommunityPage() {
    return (
        <GradientPage
            className="pt-28 sm:pt-32"
            stops={[
                "var(--color-soft-blue)",
                "var(--color-soft-pink) 40%",
                "color-mix(in oklch, var(--color-lantern) 20%, white) 72%",
                "#ffffff",
            ]}
        >
            <MarketingHero
                eyebrow="Communities"
                title={<>Find your people</>}
                sub="Servers, live spaces, group chats, and bots, for the communities you actually care about."
                ctaLabel="Join a community"
                secondaryLabel="Explore"
                secondaryHref="/explore"
                visual={
                    <div className="relative grid place-items-center overflow-hidden rounded-[36px] bg-white/50 px-6 pt-12 ring-1 ring-black/[0.04]">
                        {/* Real app screen of the Communities tab. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src="/communitydesign.png"
                            alt="The watchparty Communities screen"
                            className="w-[230px] rotate-[-3deg] rounded-[2rem]"
                        />
                    </div>
                }
            />

            <CaptionCards
                eyebrow="Under one roof"
                title="Servers, spaces, and chats in one place"
                sub="Everything Discord does — plus live audio and encrypted DMs — right where your audience already is."
                cards={[
                    { visual: <MiniServer />, bg: "bg-white", title: "Servers", body: "Channels for everything your community is into, with roles and mods." },
                    { visual: <MiniSpace />, bg: "bg-white", title: "Live spaces", body: "Drop into live audio rooms and talk to your people in real time." },
                    { visual: <MiniChat />, bg: "bg-white", title: "Group chats", body: "Direct, end-to-end encrypted conversations with the crew." },
                ]}
            />

            <BentoGrid
                eyebrow="What's inside"
                title="Built for belonging"
                items={FEATURES.map((f, i) => ({ icon: f.icon, title: f.title, body: f.body, ...BENTO_STYLE[i] }))}
            />

            <InsetBlock
                reverse
                eyebrow="Automation"
                title="Automate the boring parts"
                body="Add Discord-style bots for welcomes, moderation, and token-gated perks — so you can focus on the people, not the busywork."
                ctaLabel="Build your server"
                ctaHref="/login"
                visual={
                    <div className="w-full max-w-sm space-y-3">
                        {BOTS.map(([t, b]) => (
                            <div key={t} className="rounded-2xl bg-white p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                                <p className="text-sm font-extrabold tracking-tight text-black">{t}</p>
                                <p className="mt-0.5 text-xs font-semibold text-black/55">{b}</p>
                            </div>
                        ))}
                    </div>
                }
            />

            <ExploreMore currentHref="/community" />
            <Faq items={FAQ} />
            <ClosingCta
                title="Build your community"
                sub="Your people are already here."
                ctaLabel="Get started"
                tiles={[
                    { title: "Servers", body: "Channels for everything you're into." },
                    { title: "Live spaces", body: "Drop into live audio rooms." },
                    { title: "Bots", body: "Discord-style automation built in." },
                ]}
            />
        </GradientPage>
    );
}
