import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { MotionConfigProvider } from "@/components/motion-config-provider";
import { getServerSession } from "@/lib/auth/get-session";
import { SiteHeader } from "@/components/marketing/site-header";
import { MarketingFooter } from "@/components/marketing/footer";

// Public marketing sub-pages (explore / creators / about). Mirrors the landing:
// signed-in users skip marketing and go to the app. Shared chrome (SiteHeader +
// footer + pastel canvas) lives here so each page is just its content.
export default async function MarketingLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await getServerSession();
    if (session) {
        // Pages linked from the app's rail footer, so a signed-in reader has
        // to be able to open them — every other marketing page keeps the
        // bounce (signed-in users skip the pitch). The pathname travels on the
        // x-pathname header middleware sets, same as (app)/layout reads it.
        // Add here when the footer grows a new marketing destination
        // (e.g. /investors).
        const APP_REACHABLE = new Set(["/about"]);
        const pathname = (await headers()).get("x-pathname") ?? "";
        if (!APP_REACHABLE.has(pathname)) redirect("/home");
    }

    // Neutral base: each page paints its own scroll-reactive background
    // (ColorScrollPage), which covers main top-to-bottom, so the header floats
    // over the page's own first color and there are no band seams. Top padding
    // lives inside each page's ColorScrollPage so the background also fills the
    // header clearance.
    return (
        <MotionConfigProvider>
            <div className="relative flex min-h-svh flex-col bg-white text-black">
                <SiteHeader />
                <main className="flex-1">{children}</main>
                <MarketingFooter />
            </div>
        </MotionConfigProvider>
    );
}
