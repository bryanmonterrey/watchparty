import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { stories } from "@/db/schema/content";
import { lte } from "drizzle-orm";

export async function GET(req: NextRequest) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await db
        .delete(stories)
        .where(lte(stories.expiresAt, new Date()))
        .returning({ id: stories.id });

    return NextResponse.json({ deleted: result.length });
}
