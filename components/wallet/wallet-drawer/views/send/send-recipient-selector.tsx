"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Search, Clock } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { trpc } from "@/lib/trpc/client";
import { shortenWalletAddress } from "@/lib/utils";
import type { RecentRecipient } from "./send-recipient";

function isValidSolanaAddress(addr: string): boolean {
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr.trim());
}

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
}

export function SendRecipientSelector({
    open,
    onClose,
    onSelect,
    recents,
}: SendRecipientSelectorProps) {
    const [search, setSearch] = React.useState("");

    const rawQuery = search.startsWith("@") ? search.slice(1) : search;
    const isAddress = isValidSolanaAddress(search);
    const shouldSearch = !isAddress && rawQuery.length >= 1;

    const { data: searchData, isFetching } = trpc.user.search.useQuery(
        { query: rawQuery, limit: 8 },
        { enabled: shouldSearch && open, staleTime: 2000 }
    );

    const userResults = searchData?.users ?? [];

    const handleSelect = (recipient: SelectedRecipient) => {
        onSelect(recipient);
        onClose();
        setSearch("");
    };

    const handleClose = () => {
        onClose();
        setSearch("");
    };

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
            <DialogContent className="sm:max-w-sm rounded-3xl text-white p-0 overflow-hidden flex flex-col max-h-[75vh] shadow-2xl">
                <DialogTitle className="sr-only">Select a recipient</DialogTitle>

                {/* Header */}
                <div className="px-5 pt-5 pb-3 flex-shrink-0">
                    <span className="text-[16px] font-semibold text-white">Send to</span>
                </div>

                {/* Search */}
                <div className="px-4 pb-3 flex-shrink-0">
                    <div className="relative flex items-center bg-[#1b1b1b] rounded-2xl border border-zinc-800 focus-within:border-zinc-700 transition-colors">
                        <Search className="absolute left-4 w-[18px] h-[18px] text-zinc-400" />
                        <input
                            type="text"
                            placeholder="@username or wallet address"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            autoFocus
                            spellCheck={false}
                            autoComplete="off"
                            className="w-full bg-transparent pl-11 pr-4 py-3.5 text-[15px] font-medium placeholder:text-zinc-500 focus:outline-none"
                        />
                    </div>
                </div>

                {/* List */}
                <div className="overflow-y-auto flex-1 px-3 pb-4">

                    {/* Valid address → show as selectable row */}
                    {isAddress && (
                        <button
                            onClick={() => handleSelect({ address: search.trim(), display: shortenWalletAddress(search.trim()) })}
                            className="cursor-pointer w-full flex items-center gap-3 px-3 py-3 rounded-2xl hover:bg-zinc-800/40 transition-colors"
                        >
                            <div className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center flex-shrink-0">
                                <span className="text-[11px] font-bold text-zinc-400">◎</span>
                            </div>
                            <div className="flex-1 text-left min-w-0">
                                <p className="text-[14px] font-semibold text-white leading-tight">Send to address</p>
                                <p className="text-[12px] text-zinc-500 leading-tight">{shortenWalletAddress(search.trim())}</p>
                            </div>
                        </button>
                    )}

                    {/* User search results */}
                    {shouldSearch && (
                        <>
                            <div className="px-2 pb-2">
                                <span className="text-[12px] font-semibold text-zinc-500 uppercase tracking-wide">Users</span>
                            </div>
                            {isFetching && userResults.length === 0 && (
                                <div className="py-6 text-center text-[14px] text-zinc-500">Searching...</div>
                            )}
                            {userResults.map((u) => (
                                <button
                                    key={u.id}
                                    onClick={() => {
                                        if (!u.wallet_address) return;
                                        const display = u.username ? `@${u.username}` : u.wallet_address;
                                        handleSelect({
                                            address: u.wallet_address,
                                            display,
                                            username: u.username ?? undefined,
                                            name: u.name ?? undefined,
                                            avatar_url: u.avatar_url ?? undefined,
                                        });
                                    }}
                                    disabled={!u.wallet_address}
                                    className={`cursor-pointer w-full flex items-center gap-3 px-3 py-3 rounded-2xl transition-colors ${u.wallet_address ? "hover:bg-zinc-800/40" : "opacity-40 cursor-not-allowed"}`}
                                >
                                    <Avatar className="w-9 h-9 flex-shrink-0">
                                        <AvatarImage src={u.avatar_url ?? undefined} />
                                        <AvatarFallback className="bg-zinc-700 text-[11px]">
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1 text-left min-w-0">
                                        <p className="text-[14px] font-semibold text-white leading-tight truncate">
                                            {u.name || u.username}
                                        </p>
                                        <p className="text-[12px] text-zinc-500 leading-tight">
                                            {u.username ? `@${u.username}` : ""}
                                            {!u.wallet_address && " · no wallet"}
                                        </p>
                                    </div>
                                    {u.wallet_address && (
                                        <span className="text-[12px] text-zinc-600 flex-shrink-0">
                                            {shortenWalletAddress(u.wallet_address)}
                                        </span>
                                    )}
                                </button>
                            ))}
                            {!isFetching && userResults.length === 0 && (
                                <div className="py-6 text-center text-[14px] text-zinc-500">No users found</div>
                            )}
                        </>
                    )}

                    {/* Recents */}
                    {!shouldSearch && !isAddress && recents.length > 0 && (
                        <>
                            <div className="px-2 pb-2">
                                <span className="text-[12px] font-semibold text-zinc-500 uppercase tracking-wide">Recents</span>
                            </div>
                            {recents.slice(0, 5).map((r) => (
                                <button
                                    key={r.address}
                                    onClick={() => handleSelect({
                                        address: r.address,
                                        display: r.username ? `@${r.username}` : r.address,
                                        username: r.username,
                                        name: r.name,
                                        avatar_url: r.avatar_url,
                                    })}
                                    className="cursor-pointer w-full flex items-center gap-3 px-3 py-3 rounded-2xl hover:bg-zinc-800/40 transition-colors"
                                >
                                    {r.avatar_url ? (
                                        <Avatar className="w-9 h-9 flex-shrink-0">
                                            <AvatarImage src={r.avatar_url} />
                                            <AvatarFallback className="bg-zinc-700 text-[11px]">
                                            </AvatarFallback>
                                        </Avatar>
                                    ) : (
                                        <div className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center flex-shrink-0">
                                            <Clock className="w-4 h-4 text-zinc-500" />
                                        </div>
                                    )}
                                    <div className="flex-1 text-left min-w-0">
                                        <p className="text-[14px] font-semibold text-white leading-tight truncate">
                                            {r.username ? `@${r.username}` : shortenWalletAddress(r.address)}
                                        </p>
                                        {r.username && (
                                            <p className="text-[12px] text-zinc-500 leading-tight">
                                                {shortenWalletAddress(r.address)}
                                            </p>
                                        )}
                                    </div>
                                    <span className="text-[12px] text-zinc-500 flex-shrink-0">
                                        {r.sendCount} {r.sendCount === 1 ? "transfer" : "transfers"}
                                    </span>
                                </button>
                            ))}
                        </>
                    )}

                    {/* Empty state */}
                    {!shouldSearch && !isAddress && recents.length === 0 && (
                        <div className="py-10 text-center text-[14px] text-zinc-500">
                            Search for a user or paste a wallet address
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
