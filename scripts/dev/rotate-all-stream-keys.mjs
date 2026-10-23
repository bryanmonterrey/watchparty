// Rotate the IVS stream key of every channel that has one.
//
// Exists because until 2026-10-22 stream.getByUserId / getByUsername returned
// the whole streams row — streamKey included — to anonymous callers, so every
// key stored before that must be treated as disclosed. Same IVS steps as
// stream.resetStreamKey: create a new key, delete the old ones, store the new
// value. Live channels are SKIPPED (rotating mid-stream cuts the broadcast);
// re-run once they end.
//
//   node scripts/dev/rotate-all-stream-keys.mjs          # dry run: lists channels
//   node scripts/dev/rotate-all-stream-keys.mjs --apply  # rotates
//
// Reads PRODUCTION credentials from .env.production (DATABASE_URL for the 6543
// transaction pooler, AWS_* for IVS). Prints the project ref before touching
// anything. Never prints key values.
import { readFileSync } from "node:fs";
import postgres from "postgres";
import {
    IvsClient, ListStreamKeysCommand, CreateStreamKeyCommand, DeleteStreamKeyCommand,
} from "@aws-sdk/client-ivs";

const apply = process.argv.includes("--apply");
const env = readFileSync(".env.production", "utf8").split("\n");
const get = (k) => {
    const l = env.find((x) => x.startsWith(`${k}=`));
    return l ? l.slice(k.length + 1).replace(/^["']|["']$/g, "").trim() : undefined;
};

const url = get("DATABASE_URL");
const ref = decodeURIComponent(url.replace(/.*\/\/([^:]+):.*/, "$1")).split(".")[1] ?? "?";
console.log(`project: ${ref}  mode: ${apply ? "APPLY" : "dry run"}`);

const sql = postgres(url, { max: 1, prepare: false });
const ivs = new IvsClient({
    region: get("AWS_REGION") ?? "us-west-2",
    credentials: { accessKeyId: get("AWS_ACCESS_KEY_ID"), secretAccessKey: get("AWS_SECRET_ACCESS_KEY") },
});

try {
    const rows = await sql`select "userId", "channelArn", "isLive" from streams where "channelArn" is not null`;
    for (const r of rows) {
        const tag = `${r.userId.slice(0, 8)}… ${r.channelArn.split("/").pop()}`;
        if (r.isLive) { console.log(`SKIP (live) ${tag}`); continue; }
        if (!apply) { console.log(`would rotate ${tag}`); continue; }
        const existing = await ivs.send(new ListStreamKeysCommand({ channelArn: r.channelArn }));
        const created = await ivs.send(new CreateStreamKeyCommand({ channelArn: r.channelArn }));
        const fresh = created.streamKey?.value;
        if (!fresh) { console.log(`FAIL ${tag}: IVS returned no key`); continue; }
        // Store the new key before deleting old ones, so a failure leaves a
        // working key on the row rather than none.
        await sql`update streams set "streamKey" = ${fresh}, "updatedAt" = now() where "userId" = ${r.userId}`;
        let deleted = 0;
        for (const old of existing.streamKeys ?? []) {
            if (!old.arn || old.arn === created.streamKey?.arn) continue;
            try { await ivs.send(new DeleteStreamKeyCommand({ arn: old.arn })); deleted++; } catch (e) { console.log(`  warn: could not delete an old key (${e.name})`); }
        }
        console.log(`rotated ${tag} (old keys deleted: ${deleted})`);
    }
} finally {
    await sql.end();
}
