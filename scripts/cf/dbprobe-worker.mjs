// Minimal connectivity probe worker (2026-08-06 outage tooling).
// Opens a raw TCP socket from the Workers runtime to a host:port, sends a
// Postgres SSLRequest (needs no credentials), and reports whether the server
// answered ('S' or 'N') and how fast. Discriminates "Cloudflare egress cannot
// reach Supavisor" from "our app code is broken" with zero app involvement.
//
// Deploy:  npx wrangler deploy scripts/cf/dbprobe-worker.mjs --name watchparty-dbprobe --compatibility-date 2026-04-15
// Probe:   curl 'https://watchparty-dbprobe.<subdomain>.workers.dev/?port=6543'
//          curl 'https://watchparty-dbprobe.<subdomain>.workers.dev/?port=5432'
// Cleanup: npx wrangler delete --name watchparty-dbprobe
import { connect } from "cloudflare:sockets";

export default {
  async fetch(req) {
    const url = new URL(req.url);
    const host = url.searchParams.get("host") ?? "aws-0-us-west-2.pooler.supabase.com";
    const port = Number(url.searchParams.get("port") ?? 6543);
    const started = Date.now();
    try {
      const sock = connect({ hostname: host, port });
      const writer = sock.writable.getWriter();
      // Postgres SSLRequest: int32 length=8, int32 code=80877103 (0x04d2162f)
      await writer.write(new Uint8Array([0, 0, 0, 8, 4, 210, 22, 47]));
      const reader = sock.readable.getReader();
      const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error("read timeout 8s")), 8000));
      const { value } = await Promise.race([reader.read(), timeout]);
      const byte = value?.length ? String.fromCharCode(value[0]) : null;
      try { sock.close(); } catch {}
      return new Response(JSON.stringify({ ok: true, host, port, ms: Date.now() - started, reply: byte }), {
        headers: { "content-type": "application/json" },
      });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, host, port, ms: Date.now() - started, err: String(e) }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }
  },
};
