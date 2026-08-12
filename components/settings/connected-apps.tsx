"use client";

import { trpc } from "@/lib/trpc/client";
import { toast } from "sonner";
import { EmptyState, Panel, PanelSkeleton, PillButton } from "@/components/settings/ui";

// Third-party apps holding a "Sign in with watchparty" grant on THIS account —
// the surface the consent screen promises ("revoke access anytime from your
// account settings"). Revoke kills the app's tokens for this user immediately
// and re-shows the consent screen on its next sign-in attempt.
export function ConnectedApps() {
    const utils = trpc.useUtils();
    const { data, isLoading } = trpc.oauthGrants.list.useQuery();
    const revoke = trpc.oauthGrants.revoke.useMutation({
        onSuccess: () => {
            utils.oauthGrants.list.invalidate();
            toast.success("Access revoked");
        },
        onError: (err) => toast.error(err.message),
    });

    if (isLoading) return <PanelSkeleton rows={3} rowClassName="h-16" />;
    if (!data?.length) {
        return (
            <EmptyState
                title="No connected apps"
                hint="Apps you sign in to with your watchparty account show up here"
            />
        );
    }

    return (
        <Panel className="p-1.5">
            {data.map((app) => (
                <div
                    key={app.clientId}
                    className="flex items-center gap-3 rounded-[18px] px-3.5 py-3 hover:bg-white/[0.04]"
                >
                    <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/[0.06]">
                        {app.icon ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={app.icon} alt="" className="size-full object-cover" />
                        ) : (
                            <span className="text-sm font-bold text-white/40">{app.name.slice(0, 2)}</span>
                        )}
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                            <p className="truncate text-[15px] font-bold">{app.name}</p>
                            {app.disabled ? (
                                <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] font-semibold text-white/40">
                                    Disabled by developer
                                </span>
                            ) : null}
                        </div>
                        <p className="truncate text-[13px] font-medium text-white/40">
                            {app.scopes.length
                                ? app.scopes.map((s) => s.label).join(" · ")
                                : "Sign-in only"}
                            {" — since "}
                            {new Date(app.grantedAt).toLocaleDateString()}
                        </p>
                    </div>
                    <PillButton
                        onClick={() => revoke.mutate({ clientId: app.clientId })}
                        disabled={revoke.isPending}
                    >
                        Revoke
                    </PillButton>
                </div>
            ))}
        </Panel>
    );
}
