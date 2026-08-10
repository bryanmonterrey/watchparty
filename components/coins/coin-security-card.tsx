"use client";

// The MTT-style security block for the swap column: holder-quality stats
// (top-10 concentration, snipers, insiders, bundlers, dev bags) and contract
// flags (mint authority, freezability, taxes), from Mobula's token details.
//
// Renders nothing while there's nothing to say — a card of em-dashes under the
// trade panel would just be noise. Rows appear only when the API answered.

import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import type { CoinViewData } from "./coin-detail";
import { retryTransient } from "@/lib/query-retry";

function pct(v: number | null): string {
    if (v == null) return "—";
    if (v > 0 && v < 0.1) return "<0.1%";
    return `${v.toFixed(1)}%`;
}

function Row({
    label,
    value,
    tone,
}: {
    label: string;
    value: string;
    tone?: "good" | "bad";
}) {
    return (
        <div className="flex items-center justify-between py-1.5">
            <span className="text-[13px] font-medium text-zinc-500">{label}</span>
            <span
                className={cn(
                    "text-[13px] font-bold tabular-nums",
                    tone === "good" ? "text-lantern" : tone === "bad" ? "text-pastelred" : "text-zinc-200",
                )}
            >
                {value}
            </span>
        </div>
    );
}

export function CoinSecurityCard({ coin, cardClassName }: { coin: CoinViewData; cardClassName: string }) {
    const { data } = trpc.trade.coinSecurity.useQuery(
        { network: coin.network, address: coin.tokenAddress },
        { staleTime: 120_000, retry: retryTransient(1) },
    );
    if (!data) return null;

    // Percent rows: only the ones with an answer. Counts ride in the label.
    const holdings: { label: string; value: number | null; warnAt: number }[] = [
        { label: "top 10 holders", value: data.top10Pct, warnAt: 30 },
        {
            label: data.snipersCount ? `snipers (${data.snipersCount})` : "snipers",
            value: data.snipersPct,
            warnAt: 10,
        },
        {
            label: data.insidersCount ? `insiders (${data.insidersCount})` : "insiders",
            value: data.insidersPct,
            warnAt: 10,
        },
        {
            label: data.bundlersCount ? `bundlers (${data.bundlersCount})` : "bundlers",
            value: data.bundlersPct,
            warnAt: 10,
        },
        { label: "dev holdings", value: data.devPct, warnAt: 5 },
    ];
    const shown = holdings.filter((h) => h.value != null);

    const flags: { label: string; value: string; tone: "good" | "bad" }[] = [];
    if (data.noMintAuthority != null) {
        flags.push(
            data.noMintAuthority
                ? { label: "mint authority", value: "revoked", tone: "good" }
                : { label: "mint authority", value: "active", tone: "bad" },
        );
    }
    if (data.isFreezable != null) {
        flags.push(
            data.isFreezable
                ? { label: "freezable", value: "yes", tone: "bad" }
                : { label: "freezable", value: "no", tone: "good" },
        );
    }
    if (data.buyTaxPct != null) flags.push({ label: "buy tax", value: `${data.buyTaxPct}%`, tone: "bad" });
    if (data.sellTaxPct != null) flags.push({ label: "sell tax", value: `${data.sellTaxPct}%`, tone: "bad" });
    if (data.honeypotFlag) flags.push({ label: "blacklist", value: "flagged", tone: "bad" });

    if (shown.length === 0 && flags.length === 0) return null;

    return (
        <div className={cn(cardClassName, "mt-2 p-4")}>
            <div className="flex items-center justify-between">
                <h3 className="text-[15px] font-bold text-white">security</h3>
                {data.securityScore != null && (
                    <span
                        className={cn(
                            "text-[13px] font-bold tabular-nums",
                            data.securityScore >= 70
                                ? "text-lantern"
                                : data.securityScore >= 40
                                  ? "text-zinc-300"
                                  : "text-pastelred",
                        )}
                    >
                        {Math.round(data.securityScore)}/100
                    </span>
                )}
            </div>
            <div className="mt-1.5">
                {shown.map((h) => (
                    <Row
                        key={h.label}
                        label={h.label}
                        value={pct(h.value)}
                        tone={(h.value ?? 0) >= h.warnAt ? "bad" : undefined}
                    />
                ))}
                {flags.map((f) => (
                    <Row key={f.label} label={f.label} value={f.value} tone={f.tone} />
                ))}
            </div>
        </div>
    );
}
