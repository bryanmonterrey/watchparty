import {
    Compass01Icon, LiveStreaming01Icon, SparklesIcon,
    Rocket01Icon, UserGroupIcon, ShieldKeyIcon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";

// Central metadata for the marketing feature pages. Drives the "Explore more"
// cross-link cards (and can feed nav/footer later). One source of truth so the
// blurbs/icons/tones stay consistent across pages.
export interface MarketingFeature {
    href: string;
    title: string;
    blurb: string;
    icon: IconSvgElement;
    tone: string; // accent text-color class for the icon
}

export const MARKETING_FEATURES: MarketingFeature[] = [
    { href: "/explore", title: "Explore", blurb: "Live streams, shorts, and your timeline in one feed.", icon: Compass01Icon, tone: "text-jewel" },
    { href: "/live", title: "Go live", blurb: "Broadcast in seconds and keep every replay.", icon: LiveStreaming01Icon, tone: "text-pastelred" },
    { href: "/creators", title: "Creators", blurb: "Go live, grow, and get paid in USDC.", icon: SparklesIcon, tone: "text-sunset" },
    { href: "/coins", title: "Coins", blurb: "Launch a token and trade it in-app.", icon: Rocket01Icon, tone: "text-twitter" },
    { href: "/community", title: "Communities", blurb: "Servers, spaces, and group chats for your people.", icon: UserGroupIcon, tone: "text-pastelred" },
    { href: "/safety", title: "Safety", blurb: "Non-custodial wallets and encrypted messages.", icon: ShieldKeyIcon, tone: "text-twitter" },
];
