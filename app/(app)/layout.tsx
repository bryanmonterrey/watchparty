import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/get-session";
import AppProviders from "@/components/app-ui/app-providers";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-ui/app-sidebar";
import { AppHeader2 } from "@/components/app-ui/app-header2";
import { AppContainer } from "@/components/app-ui/app-container";
import { MobileChrome } from "@/components/app-ui/mobile/mobile-chrome";
import { MiniPlayerShell } from "@/components/app-ui/mini-player-shell";
import { UpgradeOverlay } from "@/components/premium/upgrade-overlay";
import OnboardingDialog from "@/components/app-ui/app-onboarding";
import { DesktopOnlyGate } from "@/components/app-ui/desktop-only-gate";
import { LoadingDebug } from "@/components/dev/loading-debug";

// Authenticated app shell. Guards every (app) route (no session -> /login) and
// hosts the app's provider stack + sidebar frame.
//
// Consolidation vs sidebar's layout:
// - AppProviders (Query/tRPC/cluster/Solana) lives HERE, not the root
//   layout — so login/landing never load the wallet SDK (the speed rewrite).
//   ThemeProvider is the exception: it sits in the root layout so next-themes'
//   pre-paint script runs before this async session check (no theme flash).
// - MiniPlayerShell mounts here so an opened mini player persists across
//   every (app) route; the player chunk itself stays lazy inside the shell.

// This section reads the session cookie, so it's always rendered per request.
// Declaring it explicitly stops `next build` from trying to prerender it — that
// probe was what logged "Dynamic server usage … used headers" (harmless; it was
// surfaced only by an old diagnostic try/catch here, now removed).
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  if (!session) redirect("/login");

  // Sidebar always starts fully collapsed (hover the rail to peek, trigger to
  // pin) — deliberately NOT restored from the cookie anymore.
  return (
    <AppProviders>
      {/* Below md every signed-in route shows the desktop-only notice.
          Remove when the responsive pass lands. */}
      <DesktopOnlyGate />
      <MiniPlayerShell>
        <SidebarProvider defaultOpen={false}>
          <AppSidebar />
          <SidebarInset>
            <AppHeader2 />
            <MobileChrome />
            <AppContainer>{children}</AppContainer>
          </SidebarInset>
        </SidebarProvider>
        <UpgradeOverlay />
        {/* New-user onboarding (username + avatar). Suspense because the
            dialog reads useSearchParams for its debug mode. */}
        <Suspense>
          <OnboardingDialog />
        </Suspense>
        {/* Renders nothing until ?debug-loading reveals it; then it pins the
            UI in its loading state so skeletons can be designed against. */}
        <LoadingDebug />
      </MiniPlayerShell>
    </AppProviders>
  );
}
