// Uptime monitor — the "know before users tell you" gap, closed.
//
// Runs on the cron worker's every-minute trigger (separate failure domain from
// the app worker it watches). Three probes, and the middle one is the lesson
// of 2026-08-06: a page and an anonymous session check can both pass while the
// DB path is wedged, so one probe MUST go through tRPC into Postgres.
//
// Alerting is state-transition based (Upstash Redis holds the state): two
// consecutive failing runs → "site is down" email; recovery → "recovered"
// email; while down, a reminder every 30 minutes. A single blip alerts nobody.
//
// Every entry point is wrapped — a monitor bug must never take down the crons
// it shares a worker with.

export interface MonitorEnv {
    RESEND_API_KEY?: string;
    UPSTASH_REDIS_REST_URL?: string;
    UPSTASH_REDIS_REST_TOKEN?: string;
    /** Where alerts go. A var, not a secret — it's just an address. */
    ALERT_EMAIL?: string;
}

const PROBES: { name: string; url: string }[] = [
    { name: "home", url: "https://watchparty.xyz/" },
    // tRPC → Postgres. THE load-bearing probe: pages and anonymous
    // get-session don't touch the DB, and both stayed green through the
    // container wedge while every data query hung.
    { name: "data (tRPC+DB)", url: "https://watchparty.xyz/api/trpc/trade.getFeed?batch=1&input=%7B%7D" },
    { name: "auth", url: "https://watchparty.xyz/api/auth/get-session" },
];

const TIMEOUT_MS = 10_000;
/** Consecutive failing runs (minutes) before the first alert. */
const CONFIRM_RUNS = 2;
const REALERT_MS = 30 * 60_000;
const STATE_KEY = "monitor:site-state";

type ProbeResult = { name: string; ok: boolean; status: number; ms: number; note?: string };

interface MonitorState {
    /** Consecutive runs with at least one failing probe. */
    fails: number;
    down: boolean;
    since?: number;
    lastAlert?: number;
}

// Manual race, not AbortSignal.timeout — observed on workerd (2026-08-06)
// that an aborted upstream fetch can still hang far past its signal.
async function probe(p: { name: string; url: string }): Promise<ProbeResult> {
    const started = Date.now();
    try {
        const res = await Promise.race([
            fetch(p.url, { headers: { "user-agent": "watchparty-monitor/1" } }),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS)),
        ]);
        // Drain so the connection is reusable; body content doesn't matter.
        await res.text().catch(() => {});
        return { name: p.name, ok: res.ok, status: res.status, ms: Date.now() - started };
    } catch (err) {
        return { name: p.name, ok: false, status: 0, ms: Date.now() - started, note: (err as Error).message };
    }
}

async function redis(env: MonitorEnv, path: string[]): Promise<unknown> {
    if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) return null;
    const res = await fetch(`${env.UPSTASH_REDIS_REST_URL}/${path.map(encodeURIComponent).join("/")}`, {
        headers: { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}` },
    });
    if (!res.ok) return null;
    return ((await res.json()) as { result?: unknown }).result ?? null;
}

async function getState(env: MonitorEnv): Promise<MonitorState> {
    try {
        const raw = await redis(env, ["GET", STATE_KEY]);
        if (typeof raw === "string") return JSON.parse(raw) as MonitorState;
    } catch {
        /* fresh state below */
    }
    return { fails: 0, down: false };
}

async function setState(env: MonitorEnv, state: MonitorState): Promise<void> {
    try {
        await redis(env, ["SET", STATE_KEY, JSON.stringify(state)]);
    } catch {
        /* state loss degrades to re-alerting, never to silence */
    }
}

async function sendAlert(env: MonitorEnv, subject: string, lines: string[]): Promise<void> {
    if (!env.RESEND_API_KEY || !env.ALERT_EMAIL) {
        console.error(`[monitor] ALERT (no email configured): ${subject}`);
        return;
    }
    const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
            from: "Watchparty Monitor <login@watchparty.xyz>",
            to: [env.ALERT_EMAIL],
            subject,
            text: lines.join("\n"),
        }),
    });
    if (!res.ok) console.error(`[monitor] alert send failed: ${res.status} ${await res.text().catch(() => "")}`);
}

function describe(results: ProbeResult[]): string[] {
    return results.map(
        (r) => `${r.ok ? "ok " : "FAIL"} ${r.name}: ${r.status || "-"} in ${r.ms}ms${r.note ? ` (${r.note})` : ""}`,
    );
}

export async function runMonitor(env: MonitorEnv): Promise<void> {
    try {
        const results = await Promise.all(PROBES.map(probe));
        const failing = results.filter((r) => !r.ok);
        const now = Date.now();
        const state = await getState(env);

        if (failing.length === 0) {
            if (state.down) {
                const mins = state.since ? Math.round((now - state.since) / 60_000) : 0;
                await sendAlert(env, "watchparty.xyz recovered", [
                    `All probes green after ~${mins} min down.`,
                    "",
                    ...describe(results),
                ]);
            }
            if (state.down || state.fails > 0) await setState(env, { fails: 0, down: false });
            return;
        }

        console.error(`[monitor] failing: ${describe(failing).join(" | ")}`);
        const fails = state.fails + 1;

        if (!state.down && fails >= CONFIRM_RUNS) {
            await sendAlert(env, `watchparty.xyz is DOWN (${failing.map((f) => f.name).join(", ")})`, [
                `${failing.length}/${results.length} probes failing for ${fails} consecutive minutes.`,
                "",
                ...describe(results),
                "",
                "Compare workers directly:",
                "  plain:     https://watchparty.takingpay.workers.dev/",
                "  container: https://watchparty-app.takingpay.workers.dev/",
                "Move the domain between them: node scripts/cf/attach-domains.mjs [watchparty-app]",
            ]);
            await setState(env, { fails, down: true, since: now, lastAlert: now });
        } else if (state.down && now - (state.lastAlert ?? 0) >= REALERT_MS) {
            const mins = state.since ? Math.round((now - state.since) / 60_000) : fails;
            await sendAlert(env, `watchparty.xyz still down (~${mins} min)`, describe(results));
            await setState(env, { ...state, fails, lastAlert: now });
        } else {
            await setState(env, { ...state, fails });
        }
    } catch (err) {
        // The monitor must never throw into the cron dispatcher.
        console.error(`[monitor] run failed: ${(err as Error).message}`);
    }
}
