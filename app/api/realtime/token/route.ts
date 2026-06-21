import { auth } from "@/lib/auth/server";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { signRealtimeToken } from "@/lib/realtime/token";

/**
 * Mints a short-lived realtime auth token for the signed-in user. The browser
 * passes it to the PartyServer worker (`realtime/`) as `?token=` on connect.
 */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const secret = process.env.REALTIME_SECRET;
  if (!secret) {
    console.error("REALTIME_SECRET is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const token = await signRealtimeToken(
    { sub: session.user.id, name: session.user.name ?? "User" },
    secret,
  );
  return NextResponse.json({ token });
}
