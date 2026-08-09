import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/get-session";
import { ReactQueryProvider } from "@/components/react-query-provider";
import { ConsoleView } from "@/components/developer/console-view";

export const metadata: Metadata = { title: "Developer console" };

// The console is the one signed-in surface in the (developer) group, so it
// gates itself (the group layout deliberately doesn't redirect either way).
// ReactQueryProvider is just tRPC + TanStack Query — no wallet SDKs, so this
// page stays out of the heavy (app) bundle per the speed rule.
export default async function ConsolePage() {
    const session = await getServerSession();
    if (!session) redirect("/login?callbackUrl=/developer/console");

    return (
        <ReactQueryProvider>
            <ConsoleView />
        </ReactQueryProvider>
    );
}
