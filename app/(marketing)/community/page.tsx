import { Metadata } from "next";
import {
    UserGroupIcon, Mic01Icon, Chatting01Icon,
    AiMagicIcon, SecurityCheckIcon, Compass01Icon,
} from "@hugeicons/core-free-icons";
import { MarketingHero, BentoGrid, SplitShowcase, ExploreMore, Faq } from "@/components/marketing/sections";
import { ColorScrollPage, BgZone } from "@/components/marketing/color-scroll-page";
import { CardCarousel } from "@/components/marketing/card-carousel";
import { type Feature } from "@/components/marketing/feature-card";
import { MiniServer, MiniSpace, MiniChat } from "@/components/marketing/mocks";

export const metadata: Metadata = { title: "communities" };

// The belonging page: hero, card spread, varied bento, and an asymmetric bots
// showcase. Bento carries the breadth; the split carries the automation story.

const FEATURES: Feature[] = [
    { icon: UserGroupIcon, title: "Servers", body: "Channels for everything your community is into.", accent: "text-twitter" },
    { icon: Mic01Icon, title: "Live spaces", body: "Drop into live audio rooms with your people.", accent: "text-pastelred" },
    { icon: Chatting01Icon, title: "Group chats", body: "Direct, encrypted conversations with the crew.", accent: "text-lantern" },
    { icon: AiMagicIcon, title: "Bots", body: "Discord-style automation and integrations.", accent: "text-sunset" },
    { icon: SecurityCheckIcon, title: "Moderation", body: "Roles, mods, and tools to keep it healthy.", accent: "text-twitter" },
    { icon: Compass01Icon, title: "Discover", body: "Find communities built around what you love.", accent: "text-pastelred" },
];

// Varied fills so the grid reads as color-as-identity, not white-on-white tiles.
const BENTO_STYLE = [
    { bg: "bg-twitter/10", accent: "text-twitter", span: "big" },
    { bg: "bg-[#111]", accent: "text-pastelred" },
    { bg: "bg-pastelred/10", accent: "text-lantern" },
    { bg: "bg-[#111]", accent: "text-sunset", span: "wide" },
    { bg: "bg-sunset/10", accent: "text-twitter", span: "wide" },
    { bg: "bg-[#111]", accent: "text-pastelred", span: "wide" },
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
        <ColorScrollPage className="pt-28 sm:pt-32" initial="#0e0f13">
            <BgZone bg="#0e0f13">
                <MarketingHero
                    eyebrow="Communities"
                    title={<>Find your people</>}
                    sub="Servers, live spaces, group chats, and bots, for the communities you actually care about."
                    ctaLabel="Join a community"
                    secondaryLabel="Explore"
                    secondaryHref="/explore"
                    visual={
                        <div className="relative grid place-items-center overflow-hidden rounded-[36px] bg-white/[0.04] px-6 pt-12 ring-1 ring-white/[0.08]">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src="/communitydesign.png"
                                alt="The watchparty Communities screen"
                                className="w-[230px] rotate-[-3deg] rounded-[2rem]"
                            />
                        </div>
                    }
                />
            </BgZone>

            <BgZone bg="#0e0f13">
                <CardCarousel
                    dark
                    title="Servers, spaces, and chats"
                    sub="Everything Discord does, plus live audio and encrypted DMs, right where your audience already is."
                    cards={[
                        { tone: "bg-twitter/10", node: (<><p className="text-lg font-extrabold tracking-tight text-white">Servers</p><div className="mt-4 flex flex-1 items-center justify-center"><MiniServer /></div></>) },
                        { tone: "bg-[#111]", node: (<><p className="text-lg font-extrabold tracking-tight text-white">Live spaces</p><div className="mt-4 flex flex-1 items-center justify-center"><MiniSpace /></div></>) },
                        { tone: "bg-pastelred/10", node: (<><p className="text-lg font-extrabold tracking-tight text-white">Group chats</p><div className="mt-4 flex flex-1 items-center justify-center"><MiniChat /></div></>) },
                    ]}
                />
            </BgZone>

            <BgZone bg="#0d0b12">
                <BentoGrid
                    title="Built for belonging"
                    items={FEATURES.map((f, i) => ({ icon: f.icon, title: f.title, body: f.body, ...BENTO_STYLE[i] }))}
                />

                <SplitShowcase
                    reverse
                    title="Automate the boring parts"
                    body="Add Discord-style bots for welcomes, moderation, and token-gated perks, so you can focus on the people, not the busywork."
                    ctaLabel="Build your server"
                    ctaHref="/login"
                    visual={
                        <div className="w-full max-w-sm space-y-3">
                            {BOTS.map(([t, b]) => (
                                <div key={t} className="rounded-2xl bg-white/[0.06] p-4 ring-1 ring-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                                    <p className="text-sm font-extrabold tracking-tight text-white">{t}</p>
                                    <p className="mt-0.5 text-xs font-semibold text-white/55">{b}</p>
                                </div>
                            ))}
                        </div>
                    }
                />
            </BgZone>

            <BgZone bg="#050505">
                <ExploreMore currentHref="/community" />
                <Faq items={FAQ} />
            </BgZone>
        </ColorScrollPage>
    );
}
