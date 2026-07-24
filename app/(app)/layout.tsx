import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/get-session";
import AppProviders from "@/components/app-ui/app-providers";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-ui/app-sidebar";
import { AppHeader } from "@/components/app-ui/app-header";
import { AppContainer } from "@/components/app-ui/app-container";
import { MobileChrome } from "@/components/app-ui/mobile/mobile-chrome";
import { MiniPlayerShell } from "@/components/app-ui/mini-player-shell";
import { UpgradeOverlay } from "@/components/premium/upgrade-overlay";
import OnboardingDialog from "@/components/app-ui/app-onboarding";
import { DesktopOnlyGate } from "@/components/app-ui/desktop-only-gate";

// ─── NEW APP SHELL (fresh UI build) ─────────────────────────────────────────
// This is the clean (app) group for the ground-up UI rewrite. It's a verbatim
// copy of the working shell that the old app used, kept as the *template*: the
// provider stack, session guard, and design system are already wired so a new
// UI can be built on top without re-scaffolding.
//
// The old app is RETIRED — archived (not routed) in app/_legacy/ for reference.
// Build the new UI by editing this layout and adding routes under this group;
// port screens over from _legacy one at a time as you rebuild them.
//
// Provider notes (same as before): AppProviders (Query/tRPC/cluster/Solana)
// lives HERE, not the root layout, so login/landing never load the wallet SDK.
// ThemeProvider is the exception — it's in the root layout so next-themes'
// pre-paint script runs before this async session check (no theme flash).

// Reads the session cookie, so it's always rendered per request.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  if (!session) redirect("/login");

  return (
    <AppProviders>
      {/* Below md every signed-in route shows the desktop-only notice.
          Remove when the responsive pass lands. */}
      <DesktopOnlyGate />
      <MiniPlayerShell>
        <SidebarProvider defaultOpen={false}>
          <AppSidebar />
          <SidebarInset>
            <AppHeader />
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
      </MiniPlayerShell>
    </AppProviders>
  );
}
