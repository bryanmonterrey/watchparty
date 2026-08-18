"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Clock01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import * as React from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { trpc } from "@/lib/trpc/client";
import { shortenWalletAddress } from "@/lib/utils";
import { appToast } from "@/components/app-ui/app-toast";
import { getChainOrDefault } from "@/lib/chains/registry";
import { validateAddressFormat } from "@/lib/chains/address";
import type { ChainId } from "@/lib/chains/types";
import type { RecentRecipient } from "./send-recipient";

export interface SelectedRecipient {
    address: string;
    display: string;
    username?: string;
    name?: string;
    avatar_url?: string;
}

interface SendRecipientSelectorProps {
    open: boolean;
    onClose: () => void;
    onSelect: (recipient: SelectedRecipient) => void;
    recents: RecentRecipient[];
    /** Chain the asset being sent lives on — decides what counts as an address. */
    chain?: ChainId;
}

export function SendRecipientSelector({
    open,
    onClose,
    onSelect,
    recents,
    chain = "solana",
}: SendRecipientSelectorProps) {
    const [search, setSearch] = React.useState("");
    const [resolvingUserId, setResolvingUserId] = React.useState<string | null>(null);

    const chainConfig = getChainOrDefault(chain);
    const isSolana = chainConfig.kind === "solana";
    const trpcUtils = trpc.useUtils();

    const rawQuery = search.startsWith("@") ? search.slice(1) : search;
    const isAddress = validateAddressFormat(chain, search);
    const shouldSearch = !isAddress && rawQuery.length >= 1;

    const { data: searchData, isFetching } = trpc.user.search.useQuery(
        { query: rawQuery, limit: 8 },
        { enabled: shouldSearch && open, staleTime: 2000 }
    );

    const userResults = searchData?.users ?? [];

    // Recents are a flat address book across every chain sent on. Offering one
    // that belongs to a different chain would just produce a rejected recipient.
    const chainRecents = React.useMemo(
        () => recents.filter((r) => validateAddressFormat(chain, r.address)),
        [recents, chain]
    );

    const handleSelect = (recipient: SelectedRecipient) => {
        onSelect(recipient);
        onClose();
        setSearch("");
    };

    /**
     * Picking a user off the search list gives us their Solana address. On any
     * other chain that address is meaningless, so resolve the one derived for
     * this chain's kind instead — on select, for the one person chosen, rather
     * than fetching addresses for everyone who happens to match the query.
     */
    const handleUserSelect = async (u: {
        id: string;
        wallet_address: string | null;
        username?: string | null;
        name?: string | null;
        avatar_url?: string | null;
    }) => {
        const display = u.username ? `@${u.username}` : shortenWalletAddress(u.wallet_address ?? "");
        const meta = {
            username: u.username ?? undefined,
            name: u.name ?? undefined,
            avatar_url: u.avatar_url ?? undefined,
        };

        if (isSolana) {
            if (!u.wallet_address) return;
            handleSelect({ address: u.wallet_address, display, ...meta });
            return;
        }

        setResolvingUserId(u.id);
        try {
            const { address } = await trpcUtils.wallet.getUserChainAddress.fetch({
                userId: u.id,
                kind: chainConfig.kind,
            });
            if (!address) {
                appToast.error(`${display} has no ${chainConfig.name} address yet`);
                return;
            }
            handleSelect({ address, display, ...meta });
        } catch {
            appToast.error(`Couldn't look up their ${chainConfig.name} address`);
        } finally {
            setResolvingUserId(null);
        }
    };

    const handleClose = () => {
        onClose();
        setSearch("");
    };

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
            <DialogContent className="sm:max-w-sm rounded-3xl text-white p-0 overflow-hidden flex flex-col max-h-[75vh]">
                <DialogTitle className="sr-only">Select a recipient</DialogTitle>

                {/* Header */}
                <div className="px-5 pt-5 pb-3 flex-shrink-0">
                    <span className="text-15 font-semibold text-white">Send to</span>
                </div>

                {/* Search */}
                <div className="px-4 pb-3 flex-shrink-0">
                    <div className="relative flex items-center bg-white/[0.06] rounded-full border border-baseborder/20 transition-colors focus-within:bg-white/[0.09]">
                        <HugeiconsIcon icon={Search01Icon} className="absolute left-4 w-[18px] h-[18px] text-zinc-400" />
                        <input
                            type="text"
                            placeholder="@username or wallet address"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            autoFocus
                            spellCheck={false}
                            autoComplete="off"
                            className="w-full bg-transparent pl-11 pr-4 py-3.5 text-14 font-medium placeholder:text-zinc-500 focus:outline-none"
                        />
                    </div>
                </div>

                {/* List */}
                <div className="overflow-y-auto flex-1 px-3 pb-4">

                    {/* Valid address → show as selectable row */}
                    {isAddress && (
                        <button
                            onClick={() => handleSelect({ address: search.trim(), display: shortenWalletAddress(search.trim()) })}
                            className="cursor-pointer w-full flex items-center gap-3 px-3 py-3 rounded-2xl hover:bg-white/[0.06] transition-colors"
                        >
                            <div className="w-9 h-9 rounded-full bg-white/[0.08] flex items-center justify-center flex-shrink-0">
                                <span className="text-11 font-bold text-zinc-400">◎</span>
                            </div>
                            <div className="flex-1 text-left min-w-0">
                                <p className="text-13 font-semibold text-white leading-tight">Send to address</p>
                                <p className="text-11 text-zinc-500 leading-tight">{shortenWalletAddress(search.trim())}</p>
                            </div>
                        </button>
                    )}

                    {/* User search results */}
                    {shouldSearch && (
                        <>
                            <div className="px-2 pb-2">
                                <span className="text-11 font-semibold text-zinc-500">Users</span>
                            </div>
                            {isFetching && userResults.length === 0 && (
                                <div className="py-6 text-center text-13 text-zinc-500">Searching...</div>
                            )}
                            {userResults.map((u) => (
                                <button
                                    key={u.id}
                                    onClick={() => handleUserSelect(u)}
                                    disabled={!u.wallet_address || resolvingUserId === u.id}
                                    className={`cursor-pointer w-full flex items-center gap-3 px-3 py-3 rounded-2xl transition-colors ${u.wallet_address ? "hover:bg-white/[0.06]" : "opacity-40 cursor-not-allowed"}`}
                                >
                                    <Avatar className="w-9 h-9 flex-shrink-0">
                                        <AvatarImage src={u.avatar_url ?? undefined} />
                                        <AvatarFallback className="bg-white/[0.08] text-11">
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1 text-left min-w-0">
                                        <p className="text-13 font-semibold text-white leading-tight truncate">
                                            {u.name || u.username}
                                        </p>
                                        <p className="text-11 text-zinc-500 leading-tight">
                                            {u.username ? `@${u.username}` : ""}
                                            {!u.wallet_address && " · no wallet"}
                                        </p>
                                    </div>
                                    {/* Their Solana address says nothing about
                                        where a Base or BTC send lands, so name
                                        the network being resolved instead. */}
                                    {!isSolana ? (
                                        <span className="text-11 text-zinc-600 flex-shrink-0">
                                            {resolvingUserId === u.id ? "resolving…" : chainConfig.name}
                                        </span>
                                    ) : u.wallet_address ? (
                                        <span className="text-11 text-zinc-600 flex-shrink-0">
                                            {shortenWalletAddress(u.wallet_address)}
                                        </span>
                                    ) : null}
                                </button>
                            ))}
                            {!isFetching && userResults.length === 0 && (
                                <div className="py-6 text-center text-13 text-zinc-500">No users found</div>
                            )}
                        </>
                    )}

                    {/* Recents */}
                    {!shouldSearch && !isAddress && chainRecents.length > 0 && (
                        <>
                            <div className="px-2 pb-2">
                                <span className="text-11 font-semibold text-zinc-500">Recents</span>
                            </div>
                            {chainRecents.slice(0, 5).map((r) => (
                                <button
                                    key={r.address}
                                    onClick={() => handleSelect({
                                        address: r.address,
                                        display: r.username ? `@${r.username}` : r.address,
                                        username: r.username,
                                        name: r.name,
                                        avatar_url: r.avatar_url,
                                    })}
                                    className="cursor-pointer w-full flex items-center gap-3 px-3 py-3 rounded-2xl hover:bg-white/[0.06] transition-colors"
                                >
                                    {r.avatar_url ? (
                                        <Avatar className="w-9 h-9 flex-shrink-0">
                                            <AvatarImage src={r.avatar_url} />
                                            <AvatarFallback className="bg-white/[0.08] text-11">
                                            </AvatarFallback>
                                        </Avatar>
                                    ) : (
                                        <div className="w-9 h-9 rounded-full bg-white/[0.08] flex items-center justify-center flex-shrink-0">
                                            <HugeiconsIcon icon={Clock01Icon} className="w-4 h-4 text-zinc-500" />
                                        </div>
                                    )}
                                    <div className="flex-1 text-left min-w-0">
                                        <p className="text-13 font-semibold text-white leading-tight truncate">
                                            {r.username ? `@${r.username}` : shortenWalletAddress(r.address)}
                                        </p>
                                        {r.username && (
                                            <p className="text-11 text-zinc-500 leading-tight">
                                                {shortenWalletAddress(r.address)}
                                            </p>
                                        )}
                                    </div>
                                    <span className="text-11 text-zinc-500 flex-shrink-0">
                                        {r.sendCount} {r.sendCount === 1 ? "transfer" : "transfers"}
                                    </span>
                                </button>
                            ))}
                        </>
                    )}

                    {/* Empty state */}
                    {!shouldSearch && !isAddress && chainRecents.length === 0 && (
                        <div className="py-10 text-center text-13 text-zinc-500">
                            Search for a user or paste a wallet address
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
