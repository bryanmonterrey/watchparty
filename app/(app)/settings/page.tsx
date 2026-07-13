"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useAuthSession } from "@/hooks/use-auth-session";
import {
    ALL_SETTINGS_ITEMS,
    MOVED_TO_PREMIUM,
    SettingsRail,
    itemOwnsTab,
    useSettingsTab,
} from "@/components/settings/settings-nav";
import { cn } from "@/lib/utils";

// Settings — account configuration only, two-column: SettingsRail (grouped,
// always visible) left, the active panel right; consolidated items keep a
// sub-pill row above the panel. The page title is a static "Settings" in the
// app header. Creator/money surfaces live in the /premium hub — old tab ids
// redirect there (MOVED_TO_PREMIUM) so deep links keep working.

function PanelLoading() {
    return (
        <div className="flex flex-col gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-16 overflow-hidden rounded-[20px]"><div className="size-full shimmer-skeleton" /></div>
            ))}
        </div>
    );
}

// NOTE: dynamic() options must stay inline object literals — Turbopack
// statically analyzes them and errors on a shared `const` reference.
const PrivacySettings = dynamic(() => import("@/components/settings/privacy-settings").then(m => m.PrivacySettings), { loading: PanelLoading, ssr: false });
const NotificationPreferences = dynamic(() => import("@/components/notifications/notification-preferences").then(m => m.NotificationPreferences), { loading: PanelLoading, ssr: false });
const SessionManager = dynamic(() => import("@/components/settings/session-manager").then(m => m.SessionManager), { loading: PanelLoading, ssr: false });
const BlockedList = dynamic(() => import("@/components/settings/blocked-list").then(m => m.BlockedList), { loading: PanelLoading, ssr: false });
const MutedList = dynamic(() => import("@/components/settings/muted-list").then(m => m.MutedList), { loading: PanelLoading, ssr: false });
const HiddenPostsList = dynamic(() => import("@/components/settings/hidden-posts-list").then(m => m.HiddenPostsList), { loading: PanelLoading, ssr: false });
const TwoFactorSettings = dynamic(() => import("@/components/settings/two-factor-settings").then(m => m.TwoFactorSettings), { loading: PanelLoading, ssr: false });
const AdminDashboard = dynamic(() => import("@/components/admin/admin-dashboard").then(m => m.AdminDashboard), { loading: PanelLoading, ssr: false });
const ProfileSettings = dynamic(() => import("@/components/auth/profile-settings"), { loading: PanelLoading, ssr: false });
const AccountLinking = dynamic(() => import("@/components/auth/account-linking"), { loading: PanelLoading, ssr: false });
const WalletManagement = dynamic(() => import("@/components/auth/wallet-management"), { loading: PanelLoading, ssr: false });
const PasskeyManager = dynamic(() => import("@/components/auth/passkey-manager"), { loading: PanelLoading, ssr: false });
const SecurityAuditLog = dynamic(() => import("@/components/auth/security-audit-log"), { loading: PanelLoading, ssr: false });

export default function SettingsPage() {
    const { data: session } = useAuthSession();
    const [tab, setTab] = useSettingsTab();
    const router = useRouter();

    // Moved surfaces live in /premium now — forward old deep links.
    const movedTo = MOVED_TO_PREMIUM[tab];
    useEffect(() => {
        if (movedTo) router.replace(`/premium?s=${movedTo}`);
    }, [movedTo, router]);

    const isAdmin = session?.user?.role === "admin";
    const active = ALL_SETTINGS_ITEMS.find((i) => itemOwnsTab(i, tab));

    if (movedTo) return null;

    return (
        <div className="mx-auto flex w-full max-w-5xl gap-10 px-4 pb-10 pt-6 md:pt-[calc(var(--header-height)+16px)]">
            {/* Left rail — grouped section list */}
            <aside className="w-72 shrink-0 max-lg:w-60 max-md:hidden">
                <div className="sticky top-[calc(var(--header-height)+16px)]">
                    <SettingsRail />
                </div>
            </aside>

            {/* Active panel */}
            <div className="min-w-0 max-w-3xl flex-1">
                {/* Sub-section pills for consolidated nav items */}
                {active?.subs && (
                    <div className="mb-5 flex flex-wrap gap-1.5">
                        {active.subs.map((sub) => (
                            <button
                                key={sub.id}
                                onClick={() => setTab(sub.id)}
                                className={cn(
                                    "h-9 cursor-pointer rounded-full px-4 text-[13px] font-semibold transition-colors",
                                    tab === sub.id
                                        ? "bg-white text-black"
                                        : "bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white",
                                )}
                            >
                                {sub.label}
                            </button>
                        ))}
                    </div>
                )}

                {tab === "profile" && <ProfileSettings />}
                {tab === "notifications" && <NotificationPreferences />}
                {tab === "privacy" && <PrivacySettings />}
                {tab === "blocked" && <BlockedList />}
                {tab === "muted" && <MutedList />}
                {tab === "hidden" && <HiddenPostsList />}
                {tab === "sessions" && <SessionManager />}
                {tab === "2fa" && <TwoFactorSettings />}
                {tab === "passkeys" && <PasskeyManager />}
                {tab === "audit" && <SecurityAuditLog />}
                {tab === "linked" && <AccountLinking />}
                {tab === "wallets" && <WalletManagement />}
                {tab === "admin" && isAdmin && <AdminDashboard />}
            </div>
        </div>
    );
}
