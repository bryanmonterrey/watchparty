"use client";

import { useState } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Copy01Icon, Tick02Icon, Key01Icon } from "@hugeicons/core-free-icons";
import { trpc } from "@/lib/trpc/client";
import { cn, formatUsd } from "@/lib/utils";

// Key management for the 402 gate (server/routers/apiKeys.ts). Lives on the
// portal's hardcoded-DARK shell, so colours are fixed — no theme tokens, flat
// fills + white hairlines only, lantern as the surface accent. The create
// flow's one hard rule: the plaintext key appears exactly once, here, and is
// gone on dismiss.

function money(usd: number): string {
    return usd >= 1 ? formatUsd(Math.round(usd * 100) / 100) : `$${usd.toFixed(3)}`;
}

function when(d: Date | string | null | undefined): string {
    if (!d) return "";
    return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <button
            type="button"
            onClick={() => {
                void navigator.clipboard.writeText(text);
                setCopied(true);
                setTimeout(() => setCopied(false), 1600);
            }}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-bold text-black transition-transform duration-[160ms] ease-out hover:scale-[1.02] active:scale-[0.97]"
        >
            <HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} size={16} strokeWidth={2.2} />
            {copied ? "Copied" : "Copy key"}
        </button>
    );
}

function CreatePanel({ onDone }: { onDone: () => void }) {
    const [name, setName] = useState("");
    const utils = trpc.useUtils();
    const create = trpc.apiKeys.create.useMutation({
        onSuccess: () => void utils.apiKeys.list.invalidate(),
    });

    if (create.data) {
        return (
            <div className="rounded-[24px] bg-lantern/10 p-6 ring-1 ring-lantern/30 sm:p-8">
                <p className="text-lg font-extrabold tracking-tight text-white">Your new key</p>
                <p className="mt-1 text-[15px] font-semibold leading-snug text-white/60">
                    This is the only time it will be shown. Store it somewhere safe — we keep a hash, not the key.
                </p>
                <p className="mt-5 select-all break-all rounded-2xl bg-black px-5 py-4 font-mono text-[13px] leading-relaxed text-lantern ring-1 ring-white/10">
                    {create.data.key}
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                    <CopyButton text={create.data.key} />
                    <button
                        type="button"
                        onClick={() => { create.reset(); onDone(); }}
                        className="inline-flex h-11 items-center rounded-full px-5 text-sm font-bold text-white ring-1 ring-white/15 transition-transform duration-[160ms] ease-out hover:scale-[1.02] active:scale-[0.97]"
                    >
                        Done
                    </button>
                </div>
            </div>
        );
    }

    return (
        <form
            className="rounded-[24px] bg-white/[0.04] p-6 ring-1 ring-white/10 sm:p-8"
            onSubmit={(e) => {
                e.preventDefault();
                if (name.trim() && !create.isPending) create.mutate({ name: name.trim() });
            }}
        >
            <label className="block text-lg font-extrabold tracking-tight text-white" htmlFor="key-name">
                Name your key
            </label>
            <p className="mt-1 text-[15px] font-semibold leading-snug text-white/55">
                Something that tells you where it lives — &quot;prod bot&quot;, &quot;staging&quot;, &quot;cli&quot;.
            </p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <input
                    id="key-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={64}
                    autoFocus
                    placeholder="Key name"
                    className="h-12 w-full rounded-full bg-white/[0.06] px-5 text-[15px] font-semibold text-white placeholder:text-white/30 outline-none ring-1 ring-transparent focus:ring-white/25 sm:max-w-sm"
                />
                <div className="flex gap-3">
                    <button
                        type="submit"
                        disabled={!name.trim() || create.isPending}
                        className="inline-flex h-12 items-center rounded-full bg-white px-6 text-sm font-bold text-black transition-transform duration-[160ms] ease-out hover:scale-[1.02] active:scale-[0.97] disabled:opacity-40"
                    >
                        {create.isPending ? "Creating…" : "Create key"}
                    </button>
                    <button
                        type="button"
                        onClick={onDone}
                        className="inline-flex h-12 items-center rounded-full px-6 text-sm font-bold text-white ring-1 ring-white/15 transition-transform duration-[160ms] ease-out hover:scale-[1.02] active:scale-[0.97]"
                    >
                        Cancel
                    </button>
                </div>
            </div>
            {create.error && (
                <p className="mt-4 text-sm font-bold text-pastelred">{create.error.message}</p>
            )}
        </form>
    );
}

function KeyRow({ k }: { k: { id: string; name: string; prefix: string; revoked: boolean; createdAt: Date | string; lastUsedAt: Date | string | null; balanceUsd: number; spentUsd: number } }) {
    const [confirming, setConfirming] = useState(false);
    const utils = trpc.useUtils();
    const revoke = trpc.apiKeys.revoke.useMutation({
        onSuccess: () => void utils.apiKeys.list.invalidate(),
    });

    return (
        <div className={cn("rounded-[24px] bg-white/[0.04] p-6 ring-1 ring-white/10 sm:p-7", k.revoked && "opacity-50")}>
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <p className="truncate text-lg font-extrabold tracking-tight text-white">{k.name}</p>
                        <span className="rounded-full bg-white/[0.08] px-3 py-1 font-mono text-[12px] font-semibold text-white/60">{k.prefix}</span>
                        {k.revoked && (
                            <span className="rounded-full bg-pastelred/15 px-3 py-1 text-[12px] font-bold text-pastelred">Revoked</span>
                        )}
                    </div>
                    <p className="mt-1.5 text-[13px] font-semibold text-white/40">
                        Created {when(k.createdAt)}
                        {k.lastUsedAt ? ` · last used ${when(k.lastUsedAt)}` : " · never used"}
                    </p>
                </div>
                {!k.revoked && (
                    confirming ? (
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => revoke.mutate({ id: k.id })}
                                disabled={revoke.isPending}
                                className="inline-flex h-11 items-center rounded-full bg-pastelred px-5 text-sm font-bold text-white transition-transform duration-[160ms] ease-out hover:scale-[1.02] active:scale-[0.97] disabled:opacity-40"
                            >
                                {revoke.isPending ? "Revoking…" : "Confirm revoke"}
                            </button>
                            <button
                                type="button"
                                onClick={() => setConfirming(false)}
                                className="inline-flex h-11 items-center rounded-full bg-white/[0.08] px-5 text-sm font-bold text-white transition-transform duration-[160ms] ease-out hover:scale-[1.02] active:scale-[0.97]"
                            >
                                Keep
                            </button>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setConfirming(true)}
                            className="inline-flex h-11 items-center rounded-full bg-white/[0.08] px-5 text-sm font-bold text-white transition-transform duration-[160ms] ease-out hover:scale-[1.02] active:scale-[0.97]"
                        >
                            Revoke
                        </button>
                    )
                )}
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:max-w-sm">
                <div className="rounded-2xl bg-white/[0.05] px-4 py-3">
                    <p className="text-[12px] font-bold text-white/40">Balance</p>
                    <p className="mt-0.5 font-mono text-lg font-extrabold text-lantern">{money(k.balanceUsd)}</p>
                </div>
                <div className="rounded-2xl bg-white/[0.05] px-4 py-3">
                    <p className="text-[12px] font-bold text-white/40">Spent</p>
                    <p className="mt-0.5 font-mono text-lg font-extrabold text-white">{money(k.spentUsd)}</p>
                </div>
            </div>
        </div>
    );
}

export function ConsoleView() {
    const [creating, setCreating] = useState(false);
    const keys = trpc.apiKeys.list.useQuery();

    return (
        <div className="pb-24 pt-28 sm:pt-32">
            <div className="mx-auto w-full max-w-4xl px-6">
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">Developer console</h1>
                        <p className="mt-3 max-w-md text-lg font-semibold leading-snug text-white/55">
                            Keys, balances, and spend. Priced per surface from $0.001 a call, billed from your credit balance.
                        </p>
                    </div>
                    {!creating && (
                        <button
                            type="button"
                            onClick={() => setCreating(true)}
                            className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-6 text-sm font-bold text-black transition-transform duration-[160ms] ease-out hover:scale-[1.02] active:scale-[0.97]"
                        >
                            <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={2.4} />
                            Create key
                        </button>
                    )}
                </div>

                <div className="mt-10 flex flex-col gap-4">
                    {creating && <CreatePanel onDone={() => setCreating(false)} />}

                    {keys.isPending && (
                        <>
                            <div className="h-40 rounded-[24px] bg-white/[0.04]" />
                            <div className="h-40 rounded-[24px] bg-white/[0.04]" />
                        </>
                    )}

                    {keys.error && (
                        <div className="rounded-[24px] bg-white/[0.04] p-8 ring-1 ring-white/10">
                            <p className="text-lg font-extrabold text-white">Couldn&apos;t load your keys</p>
                            <p className="mt-1 text-[15px] font-semibold text-white/55">{keys.error.message}</p>
                        </div>
                    )}

                    {keys.data && keys.data.length === 0 && !creating && (
                        <div className="grid place-items-center rounded-[24px] bg-white/[0.04] p-12 text-center ring-1 ring-white/10">
                            <span className="grid size-14 place-items-center rounded-2xl bg-white/[0.08]">
                                <HugeiconsIcon icon={Key01Icon} size={26} strokeWidth={1.8} className="text-lantern" />
                            </span>
                            <p className="mt-5 text-xl font-extrabold tracking-tight text-white">No keys yet</p>
                            <p className="mt-1 max-w-xs text-[15px] font-semibold leading-snug text-white/55">
                                Create one, fund it with credits, and you&apos;re calling the API in minutes.
                            </p>
                        </div>
                    )}

                    {keys.data?.map((k) => <KeyRow key={k.id} k={k} />)}
                </div>

                <p className="mt-10 text-[14px] font-semibold text-white/45">
                    New to the API? Start with the{" "}
                    <Link href="/developer/docs" className="font-bold text-white underline underline-offset-4">docs</Link>
                    {" "}— auth, pricing, and the x402 flow in five minutes.
                </p>
            </div>
        </div>
    );
}
