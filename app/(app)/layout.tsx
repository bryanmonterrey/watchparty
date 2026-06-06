import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getServerSession } from "@/lib/auth/get-session";
import AppProviders from "@/components/app-ui/app-providers";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-ui/app-sidebar";
import { AppHeader } from "@/components/app-ui/app-header";
import { AppContainer } from "@/components/app-ui/app-container";

// Authenticated app shell. Guards every (app) route (no session -> /login) and
// hosts the app's provider stack + sidebar frame.
//
// Consolidation vs sidebar's layout:
// - AppProviders (Query/tRPC/theme/cluster/Solana) lives HERE, not the root
//   layout — so login/landing never load the wallet SDK (the speed rewrite).
// - MiniPlayerShell is intentionally omitted for now; it pulls in the video
//   player, which nothing needs until media actually plays. Re-add with video.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Timed + logged so Vercel shows whether /home stalls or throws here (the
  // "this page couldn't load" was a function error/timeout, not a Next 500).
  const t0 = Date.now();
  console.log("[app] layout start");
  let session;
  try {
    session = await getServerSession();
  } catch (e) {
    console.error("[app] getServerSession threw after", Date.now() - t0, "ms:", e);
    throw e;
  }
  console.log("[app] session resolved in", Date.now() - t0, "ms", { hasSession: !!session });
  if (!session) redirect("/login");

  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value === "true";

  return (
    <AppProviders>
      <SidebarProvider defaultOpen={defaultOpen}>
        <AppSidebar />
        <SidebarInset>
          <AppHeader />
          <AppContainer>{children}</AppContainer>
        </SidebarInset>
      </SidebarProvider>
    </AppProviders>
  );
}
