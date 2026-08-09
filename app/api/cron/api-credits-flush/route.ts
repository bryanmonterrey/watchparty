// Reconcile the 402 gate's Redis spend counters into the api_keys ledger.
//
// The edge gate (lib/api-gate.ts) debits apigate:bal:<id> and accumulates
// apigate:spent:<id> per request; nothing durable happens at request time.
// This hourly pass GETDELs each spend counter into balance_micro/spent_micro,
// then repairs Redis where it has demonstrably lost state: a missing balance
// key, or a zero balance while the just-reconciled ledger says there are
// credits — after the spend fold those can only mean Redis data loss, so the
// ledger value is re-seeded. It also re-asserts revocation markers, the
// backstop for a revoke whose Redis write was lost.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { apiKeys } from "@/db/schema/content/api-key";
import { eq, sql } from "drizzle-orm";
import { balKey, gateRedis, revokedKey, spentKey } from "@/lib/api-gate";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    const authz = req.headers.get("authorization");
    if (authz !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const r = gateRedis();
    const rows = await db
        .select({ id: apiKeys.id, balanceMicro: apiKeys.balanceMicro, revokedAt: apiKeys.revokedAt })
        .from(apiKeys);

    let flushedMicro = 0;
    let reseeded = 0;
    const errors: string[] = [];

    for (const row of rows) {
        try {
            if (row.revokedAt) {
                await r.set(revokedKey(row.id), "1");
                continue;
            }

            const spent = Number((await r.getdel(spentKey(row.id))) ?? 0);
            let ledgerBal = row.balanceMicro;
            if (spent > 0) {
                const [u] = await db
                    .update(apiKeys)
                    .set({
                        spentMicro: sql`${apiKeys.spentMicro} + ${spent}`,
                        balanceMicro: sql`${apiKeys.balanceMicro} - ${spent}`,
                        lastUsedAt: new Date(),
                    })
                    .where(eq(apiKeys.id, row.id))
                    .returning({ balanceMicro: apiKeys.balanceMicro });
                ledgerBal = u?.balanceMicro ?? ledgerBal - spent;
                flushedMicro += spent;
            }

            if (ledgerBal > 0) {
                const live = await r.get<number>(balKey(row.id));
                if (live === null || live === undefined || live === 0) {
                    await r.set(balKey(row.id), ledgerBal);
                    reseeded++;
                }
            }
        } catch (err) {
            errors.push(`${row.id}: ${(err as Error).message}`);
        }
    }

    return NextResponse.json({ keys: rows.length, flushedMicro, reseeded, errors });
}
