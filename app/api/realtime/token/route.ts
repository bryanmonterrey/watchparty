import { auth } from "@/lib/auth/server";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { signRealtimeToken } from "@/lib/realtime/token";
import { evaluateChatGate } from "@/lib/chat/gate";
import { db } from "@/db";
import { creatorModerators } from "@/db/schema/content/creator";
import { and, eq } from "drizzle-orm";

/**
 * Mints a short-lived realtime auth token for the signed-in user. The browser
 * passes it to the PartyServer worker (`realtime/`) as `?token=` on connect.
 */
export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const secret = process.env.REALTIME_SECRET;
  if (!secret) {
    console.error("REALTIME_SECRET is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  // Whether this user may TALK in the room they're connecting to.
  //
  // Evaluated here rather than in the Durable Object because the DO has no
  // database and cannot ask who follows a channel. Signing the answer means the
  // DO enforces something it can verify instead of trusting the client. Only
  // stream-chat rooms are gated; every other room leaves the claim undefined,
  // which the DO reads as allowed.
  const room = new URL(request.url).searchParams.get("room") ?? "";
  const creatorId = room.startsWith("stream-chat:") ? room.slice("stream-chat:".length) : null;

  let chat: boolean | undefined;
  if (creatorId) {
    const mod = await db
      .select({ id: creatorModerators.id })
      .from(creatorModerators)
      .where(and(
        eq(creatorModerators.creatorId, creatorId),
        eq(creatorModerators.moderatorId, session.user.id),
      ))
      .limit(1);
    chat = (await evaluateChatGate(creatorId, session.user.id, mod.length > 0)).canChat;
  }

  const token = await signRealtimeToken(
    // The username, not the display name. This claim is what the Durable
    // Object stamps onto every chat line and onto presence, so it's what the
    // whole realtime surface renders — chat, the member roster, pinned
    // messages. @handle is the identity across this app; a display name is
    // decoration and two people can share one.
    { sub: session.user.id, name: session.user.username ?? session.user.name ?? "User", chat },
    secret,
  );
  return NextResponse.json({ token });
}
