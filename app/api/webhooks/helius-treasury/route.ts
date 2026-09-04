// Helius webhook receiver — alerts on suspicious treasury outflows.
// High-signal by design (won't spam on normal claims/sweeps):
//   • ANY outflow from the COLD wallet            → alert (your reserve is moving)
//   • SOL out of the COLLECTOR                     → alert (it should only pay gas)
//   • USDC out of the COLLECTOR to a non-cold addr → alert only if ≥ threshold
// Register the watch with scripts/premium/setup-helius-alert.ts.
import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedHeliusRequest } from "@/lib/helius/webhook-secret";
import { USDC_MINT } from "@/lib/premium/tiers";

export const dynamic = "force-dynamic";

const USDC_ALERT_THRESHOLD = Number(process.env.ALERT_USDC_THRESHOLD ?? "1000"); // whole USDC

type TokenTransfer = { fromUserAccount?: string; toUserAccount?: string; mint?: string; tokenAmount?: number };
type NativeTransfer = { fromUserAccount?: string; toUserAccount?: string; amount?: number };
type HeliusEvent = { signature?: string; tokenTransfers?: TokenTransfer[]; nativeTransfers?: NativeTransfer[] };

async function dispatchAlert(lines: string[]) {
    const body = `🚨 watchparty treasury alert\n${lines.join("\n")}`;
    console.error(body);
    const url = process.env.ALERT_WEBHOOK_URL;
    if (url) {
        try {
            // works for Discord ({content}) and Slack ({text})
            await fetch(url, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ content: body, text: body }),
            });
        } catch (e) {
            console.error("alert dispatch failed", e);
        }
    }
}

export async function POST(req: NextRequest) {
    // Only the CURRENT secret — see lib/helius/webhook-secret.ts for why a
    // stale one must be a 401 and not a fallback.
    if (!isAuthorizedHeliusRequest(req)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const collector = process.env.NEXT_PUBLIC_COLLECTOR_PUBKEY ?? process.env.NEXT_PUBLIC_TREASURY_PUBKEY;
    const cold = process.env.TREASURY_COLD_PUBKEY;

    let events: HeliusEvent[] = [];
    try {
        const json = await req.json();
        events = Array.isArray(json) ? json : [];
    } catch {
        return NextResponse.json({ ok: true });
    }

    const alerts: string[] = [];
    const short = (s?: string) => (s ? `${s.slice(0, 4)}…${s.slice(-4)}` : "?");

    for (const ev of events) {
        const sig = ev.signature?.slice(0, 10) ?? "";
        for (const t of ev.tokenTransfers ?? []) {
            const from = t.fromUserAccount;
            if (from !== collector && from !== cold) continue;
            if (from === cold) {
                alerts.push(`COLD OUT: ${t.tokenAmount} ${short(t.mint)} → ${short(t.toUserAccount)} (${sig})`);
            } else if (from === collector && t.mint === USDC_MINT) {
                const toCold = t.toUserAccount === cold;
                if (!toCold && (t.tokenAmount ?? 0) >= USDC_ALERT_THRESHOLD) {
                    alerts.push(`COLLECTOR USDC OUT: ${t.tokenAmount} → ${short(t.toUserAccount)} (${sig})`);
                }
            }
        }
        for (const n of ev.nativeTransfers ?? []) {
            const from = n.fromUserAccount;
            if (from !== collector && from !== cold) continue;
            alerts.push(`${from === cold ? "COLD" : "COLLECTOR"} SOL OUT: ${((n.amount ?? 0) / 1e9).toFixed(4)} → ${short(n.toUserAccount)} (${sig})`);
        }
    }

    if (alerts.length) await dispatchAlert(alerts);
    return NextResponse.json({ ok: true, alerted: alerts.length });
}
