import Link from "next/link";
import { Squircle } from "@/components/ui/squircle";

/**
 * Admin overview.
 *
 * `server/routers/admin.ts` has carried a complete API since long before this
 * panel existed — stats, reports, verification review, user roles, suspend,
 * remove post — with no UI anywhere in the app. The surfaces below are the
 * pages that API is still waiting on; only the one that exists links out.
 */
const SECTIONS = [
    {
        href: "/admin/coin-spam",
        title: "Coin spam review",
        body: "What the deterministic brand and security gates missed, over recently detected coins.",
        ready: true,
    },
    {
        href: "/admin",
        title: "Reports & moderation",
        body: "adminRouter.getReports / resolveReport / removePost — API exists, no page yet.",
        ready: false,
    },
    {
        href: "/admin",
        title: "Verification requests",
        body: "adminRouter.getVerificationRequests / reviewVerification — API exists, no page yet.",
        ready: false,
    },
    {
        href: "/admin",
        title: "Users",
        body: "adminRouter.searchUsers / setUserRole / suspendUser — API exists, no page yet.",
        ready: false,
    },
];

export default function AdminOverviewPage() {
    return (
        <div className="flex flex-col gap-6">
            <h1 className="text-xl font-semibold">Overview</h1>
            <div className="grid gap-3 sm:grid-cols-2">
                {SECTIONS.map((s) => {
                    const card = (
                        <div
                            className={`h-full border border-flexborder/50 bg-flexwhite/[0.03] p-4 ${
                                s.ready ? "hover:bg-flexwhite/[0.06]" : "opacity-50"
                            }`}
                        >
                            <div className="flex items-center gap-2">
                                <span className="font-medium">{s.title}</span>
                                {!s.ready && (
                                    <span className="rounded-full bg-flexwhite/10 px-2 py-0.5 text-xs text-flexwhite/60">
                                        Soon
                                    </span>
                                )}
                            </div>
                            <p className="mt-1 text-sm text-flexwhite/60">{s.body}</p>
                        </div>
                    );
                    return (
                        <Squircle asChild key={s.title} radius={18}>
                            {s.ready ? <Link href={s.href}>{card}</Link> : <div>{card}</div>}
                        </Squircle>
                    );
                })}
            </div>
        </div>
    );
}
