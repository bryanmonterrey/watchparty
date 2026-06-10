import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { polls } from "@/db/schema/content";
import { eq, and, lte, isNotNull } from "drizzle-orm";

export async function GET(req: NextRequest) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await db
        .update(polls)
        .set({ isEnded: true })
        .where(and(eq(polls.isEnded, false), isNotNull(polls.endsAt), lte(polls.endsAt!, new Date())))
        .returning({ id: polls.id });

    return NextResponse.json({ ended: result.length });
}
