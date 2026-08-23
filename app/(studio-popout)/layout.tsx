import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/get-session";
import { ReactQueryProvider } from "@/components/react-query-provider";

// Pop-out windows for the studio's live panels (S6). Its own route group
// because the whole point is to render WITHOUT the studio shell — a second
// monitor showing chat wants chat, not a sidebar and a nav rail. `(studio)`
// wraps every child in StudioShell, and a layout cannot opt a route out of its
// own group, so the only way to skip it is to live outside it.
//
// Same session gate as the studio proper: a pop-out URL is a URL, and it
// carries the creator's chat.
export const dynamic = "force-dynamic";

export default async function StudioPopoutLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  if (!session) redirect("/login?callbackUrl=/studio");

  return (
    <ReactQueryProvider>
      <div className="h-svh w-full overflow-hidden bg-background p-2 text-foreground">{children}</div>
    </ReactQueryProvider>
  );
}
