import type { Instrumentation } from "next";

// Server error reporting.
//
// Why this exists: on 2026-08-05 a profile page threw React #441 — the Server
// Components render error, whose message production deliberately suppresses,
// leaving only `digest: 2236279197` on screen. Workers Logs has been on since
// July with full sampling, so the log was the obvious place to look. It wasn't
// there: querying two days of logs for the digest, for "Minified React error"
// and for "Server Components" returned nothing, while ordinary events came back
// fine. Next was swallowing the real error and handing the client a digest that
// pointed at nothing.
//
// `onRequestError` is the hook for exactly that. It fires whenever the Next
// server captures an error, RSC renders included, and it receives the error
// BEFORE the digest replaces it.
//
// It writes to console rather than shipping anywhere: the worker already
// persists console output to Workers Logs (see wrangler.jsonc's observability
// block), which is queryable by needle after the fact. Adding an HTTP reporter
// would mean a second service to own, and a fetch on the error path — the one
// path where an extra dependency can turn a broken page into a broken response.
//
// To find one later, needle-search the logs for "[server-error]" or for the
// digest itself, which is now IN the message:
//
//   POST /accounts/<id>/workers/observability/telemetry/query
//   { parameters: { datasets: ["cloudflare-workers"],
//                   needle: { value: "<digest>", isRegex: false } } }

export const onRequestError: Instrumentation.onRequestError = (err, request, context) => {
    // Per Next's docs the instance here "might not be the original error
    // instance thrown, as it may be processed by React" — the digest is what
    // ties this line to what the user saw, so it goes first and unconditionally.
    const digest =
        typeof err === "object" && err !== null && "digest" in err
            ? String((err as { digest?: unknown }).digest)
            : "none";

    const message = err instanceof Error ? err.message : String(err);

    // One line, not an object graph. Workers Logs matches on a needle, so
    // everything worth searching for has to be in the text: the digest, the
    // path, and the message.
    console.error(
        `[server-error] digest=${digest} path=${request.path} router=${context.routerKind}` +
        ` route=${context.routePath ?? "?"} type=${context.routeType} message=${message}`,
    );

    if (err instanceof Error && err.stack) console.error(`[server-error] stack ${err.stack}`);

    // drizzle reports `Failed query: <sql>` and hides the real driver message on
    // .cause — the exact trap that cost a day on /feed (see CLAUDE.md). Anything
    // with a cause gets it printed rather than discarded.
    const cause = (err as { cause?: unknown } | null)?.cause;
    if (cause) {
        console.error(
            `[server-error] cause ${cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause)}`,
        );
    }
};
