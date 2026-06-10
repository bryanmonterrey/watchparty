import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { posts } from "@/db/schema/content";
import { eq, and, lte } from "drizzle-orm";
import { invalidateCache } from "@/lib/cache";

export async function GET(req: NextRequest) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const result = await db
        .update(posts)
        .set({ status: "published", updatedAt: now })
        .where(and(eq(posts.status, "scheduled"), lte(posts.scheduledFor!, now)))
        .returning({ id: posts.id });

    if (result.length > 0) {
        await Promise.all([
            invalidateCache("db:feed:v2:for-you:initial:20"),
            invalidateCache("db:feed:v2:following:initial:20"),
            invalidateCache("db:feed:v2:news:initial:20"),
        ]);
    }

    return NextResponse.json({ published: result.length });
}
