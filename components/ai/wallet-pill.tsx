"use client";

import { GooDropdown, gooMenuItem } from "@/components/ui/goo-dropdown";
import { WalletIcon } from "@/components/icons";
import { trpc } from "@/lib/trpc/client";

// Which wallet the assistant is talking about, picked from the composer.
//
// NEVER renders an address. Wallets are named by their label, falling back to
// what kind they are — the app-wide rule is that addresses are for functional
// use, not for display, and a truncated base58 tells a user nothing anyway.
// Someone with 15 linked wallets distinguishes them by name, not by prefix.
//
// A picker, not a grant. Choosing a wallet here scopes what the assistant
// READS and talks about; it confers no spending authority. Spending will be
// gated separately by a capped, revocable grant tied to the connector
// credential — deliberately NOT to the conversation, so a long chat can't
// quietly hold a long-lived key. See docs/TODO.md.

export type PickedWallet = { address: string; name: string; source: "swig" | "extension" };

function nameFor(w: { label: string | null; source: string; isPrimary: boolean }) {
    if (w.label) return w.label;
    if (w.source === "swig") return w.isPrimary ? "watchparty wallet" : "watchparty";
    return "connected wallet";
}

export function WalletPill({
    value,
    onChange,
}: {
    value: PickedWallet | null;
    onChange: (next: PickedWallet) => void;
}) {
    const { data } = trpc.wallet.listLinkedWallets.useQuery(undefined, { staleTime: 60_000 });
    const wallets = data?.wallets ?? [];

    // Nothing to pick between — a one-option dropdown is a button that lies.
    if (wallets.length <= 1) return null;

    const active = value ?? (() => {
        const primary = wallets.find((w) => w.isPrimary) ?? wallets[0];
        return primary
            ? { address: primary.address, name: nameFor(primary), source: primary.source }
            : null;
    })();

    return (
        <GooDropdown
            side="top"
            align="start"
            width={260}
            itemHeight={44}
            triggerAriaLabel="choose wallet"
            trigger={
                <span className="flex h-8 max-w-[160px] items-center gap-1.5 rounded-full border border-white/10 bg-soft-gray-10 px-3 text-xs font-medium text-zinc-300 transition-colors hover:bg-soft-gray-15 hover:text-white">
                    <WalletIcon className="size-3.5 shrink-0" />
                    <span className="truncate">{active?.name ?? "wallet"}</span>
                </span>
            }
            items={wallets.map((w) =>
                gooMenuItem({
                    key: w.address,
                    label: nameFor(w),
                    right:
                        active?.address === w.address ? (
                            <span className="text-xs text-lantern">active</span>
                        ) : undefined,
                    onClick: () =>
                        onChange({ address: w.address, name: nameFor(w), source: w.source }),
                }),
            )}
        />
    );
}
