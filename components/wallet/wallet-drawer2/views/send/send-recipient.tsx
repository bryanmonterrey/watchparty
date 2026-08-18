"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Clock01Icon } from "@hugeicons/core-free-icons";
import * as React from "react";
import { createPortal } from "react-dom";
import { trpc } from "@/lib/trpc/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { shortenWalletAddress } from "@/lib/utils";
import { motion, AnimatePresence } from "motion/react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RecentRecipient {
    address: string;
    username?: string;
    name?: string;
    avatar_url?: string;
    sendCount: number;
    lastSentAt: number;
}

interface SendRecipientProps {
    value: string;
    displayValue: string;
    onChange: (address: string, display: string, meta?: { username?: string; name?: string; avatar_url?: string }) => void;
    recents: RecentRecipient[];
    variant?: "default" | "minimal";
}

function isValidSolanaAddress(addr: string): boolean {
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr.trim());
}

// ─── Portal dropdown ──────────────────────────────────────────────────────────

interface DropdownPortalProps {
    anchorRef: React.RefObject<HTMLDivElement | null>;
    children: React.ReactNode;
}

function DropdownPortal({ anchorRef, children }: DropdownPortalProps) {
    const [rect, setRect] = React.useState<DOMRect | null>(null);

    React.useLayoutEffect(() => {
        const updateRect = () => {
            if (anchorRef.current) {
                setRect(anchorRef.current.getBoundingClientRect());
            }
        };
        updateRect();
        window.addEventListener("scroll", updateRect, true);
        window.addEventListener("resize", updateRect);
        return () => {
            window.removeEventListener("scroll", updateRect, true);
            window.removeEventListener("resize", updateRect);
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    if (!rect) return null;

    return createPortal(
        <div
            data-dropdown-container="true"
            style={{
                position: "fixed",
                top: rect.bottom + 6,
                left: rect.left,
                width: rect.width,
                zIndex: 9999,
            }}
        >
            {children}
        </div>,
        document.body
    );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SendRecipient({ value, displayValue, onChange, recents, variant = "default" }: SendRecipientProps) {
    const [focused, setFocused] = React.useState(false);
    const [inputDraft, setInputDraft] = React.useState(displayValue ?? "");
    const containerRef = React.useRef<HTMLDivElement>(null);
    const inputRef = React.useRef<HTMLInputElement>(null);

    const rawQuery = inputDraft.startsWith("@") ? inputDraft.slice(1) : inputDraft;
    const isAtSearch = inputDraft.startsWith("@") || (inputDraft.length > 0 && !isValidSolanaAddress(inputDraft));
    const shouldSearch = isAtSearch && rawQuery.length >= 1;

    const { data: searchData, isFetching } = trpc.user.search.useQuery(
        { query: rawQuery, limit: 6 },
        { enabled: shouldSearch && focused, staleTime: 2000 }
    );

    const userResults = searchData?.users ?? [];

    const isRawAddress = !inputDraft.startsWith("@") && inputDraft.length >= 10;
    const isValid = isRawAddress && isValidSolanaAddress(inputDraft);
    const isInvalid = isRawAddress && inputDraft.length >= 32 && !isValidSolanaAddress(inputDraft);

    const showRecents = focused && inputDraft.length === 0 && recents.length > 0;
    const showUserResults = focused && shouldSearch && (userResults.length > 0 || isFetching);
    const showDropdown = showRecents || showUserResults;

    // Close on outside click
    React.useEffect(() => {
        const handler = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            const isInsideContainer = containerRef.current?.contains(target);
            const isInsideDropdown = target.closest('[data-dropdown-container="true"]');
            
            if (!isInsideContainer && !isInsideDropdown) {
                setFocused(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    React.useEffect(() => {
        setInputDraft(displayValue ?? "");
    }, [displayValue]);

    const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setInputDraft(val);
        if (isValidSolanaAddress(val)) onChange(val, val);
        else onChange("", val);
    };

    const selectUser = (u: { wallet_address: string | null; username: string | null; name: string | null; avatar_url: string | null }) => {
        if (!u.wallet_address) return;
        const display = u.username ? `@${u.username}` : u.wallet_address;
        setInputDraft(display);
        onChange(u.wallet_address, display, {
            username: u.username ?? undefined,
            name: u.name ?? undefined,
            avatar_url: u.avatar_url ?? undefined,
        });
        setFocused(false);
    };

    const selectRecent = (r: RecentRecipient) => {
        const display = r.username ? `@${r.username}` : r.address;
        setInputDraft(display);
        onChange(r.address, display);
        setFocused(false);
    };

    const dropdownContent = (
        <motion.div
            key="dropdown"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 380, damping: 28 }}
            className="bg-panel2 border border-baseborder/20 rounded-3xl overflow-hidden"
        >
            {/* Recents */}
            {showRecents && (
                <>
                    <div className="px-4 pt-3 pb-1.5">
                        <span className="text-11 font-semibold text-zinc-500">Recents</span>
                    </div>
                    {recents.slice(0, 5).map((r) => (
                        <button
                            key={r.address}
                            onMouseDown={(e) => { e.preventDefault(); selectRecent(r); }}
                            className="cursor-pointer w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.06] transition-colors"
                        >
                            {r.avatar_url ? (
                                <Avatar className="size-9 shrink-0">
                                    <AvatarImage src={r.avatar_url} />
                                    <AvatarFallback />
                                </Avatar>
                            ) : (
                                <div className="grid size-9 shrink-0 place-items-center rounded-full bg-white/[0.08]">
                                    <HugeiconsIcon icon={Clock01Icon} className="w-4 h-4 text-zinc-500" />
                                </div>
                            )}
                            <div className="flex-1 text-left min-w-0">
                                <p className="text-13 font-semibold text-white leading-tight">
                                    {r.username ? `@${r.username}` : shortenWalletAddress(r.address)}
                                </p>
                                {r.username && (
                                    <p className="text-11 text-zinc-500 leading-tight">{shortenWalletAddress(r.address)}</p>
                                )}
                            </div>
                            <span className="text-11 text-zinc-500 flex-shrink-0">
                                {r.sendCount} {r.sendCount === 1 ? "transfer" : "transfers"}
                            </span>
                        </button>
                    ))}
                    <div className="h-2" />
                </>
            )}

            {/* User search results */}
            {showUserResults && (
                <>
                    {isFetching && userResults.length === 0 && (
                        <div className="px-4 py-4 text-12 text-zinc-500">Searching…</div>
                    )}
                    {userResults.map((u) => (
                        <button
                            key={u.id}
                            onMouseDown={(e) => { e.preventDefault(); if (u.wallet_address) selectUser(u); }}
                            disabled={!u.wallet_address}
                            className={`cursor-pointer w-full flex items-center gap-3 px-4 py-3 transition-colors ${u.wallet_address ? "hover:bg-white/[0.06]" : "opacity-40 cursor-not-allowed"
                                }`}
                        >
                            <Avatar className="size-9 shrink-0">
                                <AvatarImage src={u.avatar_url ?? undefined} />
                                <AvatarFallback />
                            </Avatar>
                            <div className="flex-1 text-left min-w-0">
                                <p className="text-13 font-semibold text-white leading-tight">
                                    {u.name || u.username}
                                </p>
                                <p className="text-11 text-zinc-500 leading-tight">
                                    {u.username ? `@${u.username}` : ""}
                                    {!u.wallet_address && " · no wallet"}
                                </p>
                            </div>
                            {u.wallet_address && (
                                <span className="text-11 text-zinc-600 flex-shrink-0">
                                    {shortenWalletAddress(u.wallet_address)}
                                </span>
                            )}
                        </button>
                    ))}
                    {!isFetching && userResults.length === 0 && (
                        <div className="px-4 py-4 text-12 text-zinc-500">No users found</div>
                    )}
                    <div className="h-2" />
                </>
            )}
        </motion.div>
    );

    if (variant === "minimal") {
        return (
            <div ref={containerRef} className="w-full relative group">
                <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none">
                    <div className="w-8 h-8 rounded-full bg-white/[0.08] flex items-center justify-center">
                        <span className="text-zinc-400 text-13 font-bold">@</span>
                    </div>
                </div>
                <input
                    ref={inputRef}
                    type="text"
                    value={inputDraft}
                    onChange={handleInput}
                    onFocus={() => setFocused(true)}
                    placeholder="Recipient's Solana address"
                    spellCheck={false}
                    autoComplete="off"
                    className="h-14 w-full rounded-3xl border border-baseborder/20 bg-panel2 px-4 pr-14 text-14 text-white placeholder:text-zinc-600 outline-none transition-colors focus:bg-white/[0.05]"
                />
                
                <AnimatePresence>
                    {showDropdown && (
                        <DropdownPortal anchorRef={containerRef}>
                            {dropdownContent}
                        </DropdownPortal>
                    )}
                </AnimatePresence>
            </div>
        );
    }

    return (
        <div ref={containerRef} className="relative">
            {/* Input card */}
            <div
                onClick={() => inputRef.current?.focus()}
                className={`cursor-pointer rounded-3xl border border-baseborder/20 bg-panel2 px-5 py-4 flex items-start gap-3 transition-colors ${focused ? "bg-white/[0.05]" : ""
                    }`}
            >
                <div className="flex-1 min-w-0">
                    <p className="text-12 font-medium text-zinc-500 mb-1">To</p>
                    <input
                        ref={inputRef}
                        type="text"
                        value={inputDraft}
                        onChange={handleInput}
                        onFocus={() => setFocused(true)}
                        placeholder="@username or wallet address"
                        spellCheck={false}
                        autoComplete="off"
                        className="bg-transparent cursor-pointer text-13 font-medium text-white placeholder-zinc-600 outline-none w-full"
                    />
                </div>
                {(isValid || isInvalid) && (
                    // Address valid / invalid IS semantic, so it keeps a
                    // colour — but the app's two, not emerald-400 and red-400,
                    // which appear nowhere else in the drawer.
                    <div className={`mt-2 size-2 shrink-0 rounded-full ${isValid ? "bg-lantern" : "bg-pastelred"}`} />
                )}
            </div>

            {/* Portal dropdown — renders at document.body level to escape overflow clipping */}
            <AnimatePresence>
                {showDropdown && (
                    <DropdownPortal anchorRef={containerRef}>
                        {dropdownContent}
                    </DropdownPortal>
                )}
            </AnimatePresence>
        </div>
    );
}
