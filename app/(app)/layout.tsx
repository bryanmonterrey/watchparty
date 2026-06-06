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
  const session = await getServerSession();
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
