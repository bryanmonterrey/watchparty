import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/get-session";
import { ReactQueryProvider } from "@/components/react-query-provider";
import { StudioShell } from "@/components/studio/studio-shell";

// The creator studio, served at studio.watchparty.xyz (host-rewritten to
// /studio in middleware). Every page here is creator-only, so the group
// layout gates on the session cookie and wraps only ReactQueryProvider —
// tRPC + TanStack Query, no wallet SDKs — keeping the studio out of the heavy
// (app) bundle (the speed rule). On-chain actions (payouts, coins) link out
// to the /premium hub, which already carries the wallet stack.
export const dynamic = "force-dynamic";

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  if (!session) redirect("/login?callbackUrl=/studio");

  return (
    <ReactQueryProvider>
      <StudioShell>{children}</StudioShell>
    </ReactQueryProvider>
  );
}
