import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/get-session";
import AppProviders from "@/components/app-ui/app-providers";

// Bare shell for detached windows (currently just pop-out chat).
//
// Its own route group because the pieces (app) adds are all wrong for a window
// the user has deliberately made small and put on a second monitor: the
// sidebar, the app header, the mini-player shell, the onboarding dialog — and
// DesktopOnlyGate especially, which would cover a 420px pop-out with the
// "desktop only" notice.
//
// It still needs AppProviders: chat is tRPC + TanStack Query, and this window is
// a separate document with its own React tree, so it cannot borrow the opener's.
// That's the same rule the speed rewrite runs on — providers live at the route
// group that needs them, never the root layout.

export const dynamic = "force-dynamic";

export default async function PopoutLayout({ children }: { children: React.ReactNode }) {
    const session = await getServerSession();
    if (!session) redirect("/login");

    return (
        <AppProviders>
            <div className="flex h-[100svh] flex-col bg-canvas">{children}</div>
        </AppProviders>
    );
}
