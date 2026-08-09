import { SiteHeader } from "@/components/marketing/site-header";
import { MarketingFooter } from "@/components/marketing/footer";

// Developer portal shell — the marketing chrome WITHOUT the signed-in redirect
// that (marketing)/layout.tsx does. That redirect is correct for brochure
// pages, but the console is a signed-in surface: bouncing a logged-in
// developer to /home would make the portal unreachable for exactly the people
// it exists for. The landing/docs stay public; the console does its own
// session check server-side.
export default function DeveloperLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="relative flex min-h-svh flex-col bg-white text-black">
            <SiteHeader />
            <main className="flex-1">{children}</main>
            <MarketingFooter />
        </div>
    );
}
