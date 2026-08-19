"use client";

import * as React from "react";
import { trpc } from "@/lib/trpc/client";

// Which linked wallet the user is currently spending FROM.
//
// An account can hold up to 15 Solana wallets (`linked_wallets`), but every
// balance read in the app goes through `user.wallet_address`, which mirrors
// only the PRIMARY. So funds sitting in a linked extension wallet were
// invisible — the buy dialog read an empty embedded wallet while the money was
// one row away.
//
// One active at a time (owner's call over aggregating), and BOTH balances and
// signing follow it. That second half is the part that has to stay true: a
// picker that changes which balances you see without changing which wallet
// pays would be worse than no picker at all.

const ACTIVE_KEY = "wallet:active";

export type LinkedWallet = {
    id: string;
    address: string;
    source: "swig" | "extension";
    /**
     * Which chain this wallet is ON. null = the multichain generated wallet,
     * which holds an address on every chain kind. An external wallet is one
     * chain, and for an EVM one that is what stops the Solana adapter from
     * being asked whether it is "in use".
     */
    chainKind: "solana" | "evm" | "bitcoin" | "sui" | null;
    /**
     * The chain this wallet signed in on — 8453 Base, 1 Ethereum. Null when it
     * predates the column or has no single chain (Solana, and the multichain
     * generated wallet). The picker needs it because chainKind "evm" cannot
     * choose between the Base and Ethereum marks.
     *
     * OPTIONAL, not merely nullable: the field is being added to the procedure
     * in a different session's uncommitted work, so this type must tolerate a
     * payload that does not carry it yet. The row falls back to the kind's
     * generic mark in that window, which is what a NULL does anyway.
     */
    chainId?: number | null;
    label: string | null;
    isPrimary: boolean;
};

/**
 * A name that is not an address.
 *
 * Addresses are never rendered (house rule), so wallets are named by label,
 * then by source. Several wallets can share a source, so unlabelled duplicates
 * are numbered — "Extension 2" is worse than a real name and much better than
 * two identical rows.
 */
export function walletName(w: LinkedWallet, indexWithinSource: number): string {
    if (w.label) return w.label;
    const base = w.source === "swig" ? "Watchparty wallet" : "Extension";
    return indexWithinSource > 0 ? `${base} ${indexWithinSource + 1}` : base;
}

export function useActiveWallet(enabled = true) {
    const wallets = trpc.wallet.listLinkedWallets.useQuery(undefined, {
        enabled,
        staleTime: 60_000,
        retry: false,
    });

    const [activeAddress, setActiveAddress] = React.useState<string | null>(null);

    // Restore on the client only — reading localStorage during render would
    // desync SSR and hydration.
    React.useEffect(() => {
        setActiveAddress(localStorage.getItem(ACTIVE_KEY));
    }, []);

    // `.wallets`, not the payload itself: the procedure returns
    // `{ wallets, max }`. This read `(wallets.data ?? []) as LinkedWallet[]`,
    // which made `list` the OBJECT and crashed every consumer with
    // "l.map is not a function" — and the `as` cast is what let it compile.
    //
    // No cast now, deliberately. tsc had the right answer and was told to be
    // quiet; asserting a shape you did not check is how a runtime crash gets
    // through a clean type-check.
    const list: LinkedWallet[] = React.useMemo(
        () => wallets.data?.wallets ?? [],
        [wallets.data],
    );

    const setActive = React.useCallback((address: string) => {
        setActiveAddress(address);
        localStorage.setItem(ACTIVE_KEY, address);
    }, []);

    /** Display names, resolved once so the numbering is stable across renders
     *  and identical everywhere — deriving it per call site would let two
     *  places disagree about which wallet is "Extension 2". */
    const named = React.useMemo(() => {
        const seen: Record<string, number> = {};
        return list.map((w) => {
            const i = seen[w.source] ?? 0;
            seen[w.source] = i + 1;
            return { ...w, name: walletName(w, i) };
        });
    }, [list]);

    // Falls back to the primary, then to whatever exists. A stored choice for a
    // wallet that has since been unlinked must not strand the picker on it.
    // Taken from the NAMED list so callers get the name too.
    const active =
        named.find((w) => w.address === activeAddress) ??
        named.find((w) => w.isPrimary) ??
        named[0];

    return {
        wallets: named,
        active,
        setActive,
        loading: wallets.isLoading,
        /** More than one wallet is the only case where a switcher earns its space. */
        hasChoice: list.length > 1,
    };
}
