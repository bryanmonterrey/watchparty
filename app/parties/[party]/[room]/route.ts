import { connection } from "next/server";
import { upgradeWebSocket } from "@vercel/functions";
import { PARTY } from "@/lib/realtime/protocol";
import { verifyRealtimeToken } from "@/lib/realtime/verify";
import { attach, devStreamConnections, mayJoin, publish } from "@/lib/realtime/hub";
import type { ServerEvent } from "@/lib/realtime/protocol";

// The realtime endpoint: wss://watchparty.xyz/parties/chat/<room>?token=…
//
// Same URL shape the PartyKit worker served (partysocket builds
// /parties/<party>/<room>), so clients, external developers using
// /api/stream/token, and the developer docs only needed the host changed.
// middleware.ts excludes /parties/ — this path authenticates itself, and the
// page middleware would otherwise send signed-out upgrades to /login.
//
//   GET + Upgrade        a room socket (token in ?token=, minted by /api/realtime/token)
//   GET + secret         dev-stream rooms only: connection log for the console
//   POST + secret        server publish (kept for callers outside this app)

export const runtime = "nodejs";
// A socket closes when its invocation hits this; PartySocket reconnects.
export const maxDuration = 300;

type Ctx = { params: Promise<{ party: string; room: string }> };

async function roomOf(ctx: Ctx): Promise<string | null> {
    const { party, room } = await ctx.params;
    if (party !== PARTY) return null;
    const decoded = decodeURIComponent(room);
    return /[/?#]/.test(decoded) ? null : decoded;
}

const hasSecret = (req: Request) =>
    !!process.env.REALTIME_SECRET && req.headers.get("x-realtime-secret") === process.env.REALTIME_SECRET;

export async function GET(req: Request, ctx: Ctx) {
    await connection();
    const room = await roomOf(ctx);
    if (!room) return new Response("Not found", { status: 404 });

    if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") {
        if (!hasSecret(req)) return new Response("forbidden", { status: 403 });
        if (!room.startsWith("dev-stream:")) return new Response("not found", { status: 404 });
        return Response.json({ connections: await devStreamConnections(room) });
    }

    // Authenticate BEFORE upgrading, so a bad token is a clean 401/403 and
    // never opens a socket.
    const token = new URL(req.url).searchParams.get("token");
    const claims = token && process.env.REALTIME_SECRET ? await verifyRealtimeToken(token, process.env.REALTIME_SECRET) : null;
    if (!claims) return new Response("unauthorized", { status: 401 });
    if (!mayJoin(room, claims)) return new Response("forbidden", { status: 403 });

    return upgradeWebSocket((ws) => {
        void attach(ws, room, claims).catch((err) => {
            console.error("[realtime] attach failed", room, err);
            ws.close(1011, "attach failed");
        });
    });
}

export async function POST(req: Request, ctx: Ctx) {
    const room = await roomOf(ctx);
    if (!room) return new Response("Not found", { status: 404 });
    if (!hasSecret(req)) return new Response("forbidden", { status: 403 });
    let event: ServerEvent;
    try {
        event = (await req.json()) as ServerEvent;
    } catch {
        return new Response("bad request", { status: 400 });
    }
    const res = await publish(room, event);
    return new Response(res.ok ? "ok" : "unknown message", { status: res.status });
}
