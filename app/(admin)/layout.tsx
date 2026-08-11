import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/get-session";
import { db } from "@/db";
import { user } from "@/db/schema/auth";
import { eq } from "drizzle-orm";
import { ReactQueryProvider } from "@/components/react-query-provider";
import { AdminShell } from "@/components/admin/admin-shell";

/**
 * The internal admin panel, served at admin.watchparty.xyz (host-rewritten to
 * /admin in middleware), following the studio pattern rather than console's
 * separate worker: the whole admin API already lives in this app's
 * `adminRouter`, so a separate app would duplicate auth and tRPC wiring for a
 * handful of internal pages.
 *
 * ## The role is read from the DATABASE here, not from the session
 *
 * `session.user.role` is carried in the session payload and therefore CACHED —
 * revoking someone's admin role would not take effect until their session
 * refreshed. For ordinary UI that is a fine trade; for the panel that can
 * suspend users and change roles it is not, so this re-reads the row.
 *
 * This layout is defence in depth and NOT the security boundary. Every mutation
 * behind it goes through `adminProcedure`, which performs the same check
 * server-side per request — a page gate only decides what renders, never what
 * is allowed. The same rule as premium (CLAUDE.md).
 */
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
    const session = await getServerSession();
    if (!session) redirect("/login?callbackUrl=/admin");

    const [row] = await db
        .select({ role: user.role })
        .from(user)
        .where(eq(user.id, session.user.id))
        .limit(1);

    // 404, not 403: an admin panel should not confirm it exists to someone who
    // cannot use it.
    if (row?.role !== "admin") redirect("/");

    return (
        <ReactQueryProvider>
            <AdminShell>{children}</AdminShell>
        </ReactQueryProvider>
    );
}
