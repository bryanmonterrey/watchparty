import { redirect } from "next/navigation";
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
    if (session) redirect("/home");

    // Neutral base: each page paints its own continuous gradient (GradientPage),
    // which covers main top-to-bottom, so the header floats over the page's own
    // first color and there are no band seams. Top padding lives inside each
    // page's GradientPage so the gradient also fills the header clearance.
    return (
        <div className="relative flex min-h-svh flex-col bg-white text-black">
            <SiteHeader />
            <main className="flex-1">{children}</main>
            <MarketingFooter />
        </div>
    );
}
