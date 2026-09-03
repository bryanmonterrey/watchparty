// Referral smoke — exercises the REAL referral router (getMyCode / applyCode /
// claimUsernameSlug / getStats) through a tRPC caller against the DEV
// database, with throwaway users that are deleted at the end (referrals rows
// cascade). The pure rules are covered by tests/referral-rules.test.ts; this
// proves the SQL around them (lower() matching, unique slug/code indexes,
// NULL-conditioned updates) against a live Postgres.
//
//   bun scripts/dev/smoke-referral.ts
//
// Refuses to run against production: it rebinds DATABASE_URL to DIRECT_URL
// (the dev project in .env.local) and aborts unless the ref is the dev one.
// Requires db/referral-slug.sql to have been applied to that database.

// Module marker: the imports below are dynamic (they must run AFTER the
// DATABASE_URL rebind), so without this tsc treats the file as a script and
// rejects the top-level awaits.
export {};

const DEV_REF = "hghxcuro";
const PROD_REF = "ugpzuypo";

const direct = process.env.DIRECT_URL ?? "";
if (!direct.includes(DEV_REF) || direct.includes(PROD_REF)) {
    console.error("DIRECT_URL is not the dev project — refusing to write. target ref:", direct.match(/postgres\.([a-z]{8})/)?.[1] ?? "unknown");
    process.exit(2);
}
process.env.DATABASE_URL = direct;

const { db } = await import("@/db");
const { user } = await import("@/db/schema/auth");
const { referrals } = await import("@/db/schema/content");
const { eq, inArray } = await import("drizzle-orm");
const { createCallerFactory } = await import("@/server/trpc");
const { referralRouter } = await import("@/server/routers/referral");

const RUN = `smkref${Date.now().toString(36)}`;
const made: string[] = [];
let failures = 0;
const DAY = 86_400_000;

function pass(msg: string) { console.log("PASS", msg); }
function fail(msg: string) { failures++; console.log("FAIL", msg); }

async function mkUser(tag: string, username: string | null, opts: { createdAt?: Date; isBot?: boolean } = {}) {
    const id = `${RUN}-${tag}`;
    await db.insert(user).values({
        id,
        name: `Smoke ${tag}`,
        username,
        email: `${id}@smoke.invalid`,
        emailVerified: true,
        gender: false,
        isBot: opts.isBot ?? false,
        ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
    });
    made.push(id);
    return id;
}

const createCaller = createCallerFactory(referralRouter);
function as(userId: string) {
    // Minimal Context: protectedProcedure only checks user + session truthiness.
    return createCaller({
        session: { user: { id: userId }, session: { id: `s-${userId}` } },
        user: { id: userId, wallet_address: null },
        headers: new Headers(),
        bot: null,
    } as never);
}

async function expectError(p: Promise<unknown>, needle: string, label: string) {
    try {
        await p;
        fail(`${label} — expected an error containing "${needle}", got success`);
    } catch (e) {
        const msg = (e as Error).message ?? String(e);
        if (msg.includes(needle)) pass(`${label} → "${msg}"`);
        else fail(`${label} — expected "${needle}", got "${msg}"`);
    }
}

async function referredBy(id: string) {
    const [r] = await db.select({ referredBy: user.referredBy }).from(user).where(eq(user.id, id)).limit(1);
    return r?.referredBy ?? null;
}

try {
    const alice = await mkUser("alice", `${RUN}alice`);
    const mixed = await mkUser("mixed", `${RUN}Mixed`);           // capital letter, like 6 real accounts
    const bob = await mkUser("bob", `${RUN}bob`);
    const carol = await mkUser("carol", null);                    // no username yet
    const dave = await mkUser("dave", `${RUN}dave`);
    const erin = await mkUser("erin", `${RUN}erin`);
    const frank = await mkUser("frank", `${RUN}frank`);
    const gina = await mkUser("gina", `${RUN}gina`);
    const hank = await mkUser("hank", `${RUN}hank`);
    const ivy = await mkUser("ivy", `${RUN}ivy`);
    const oldtimer = await mkUser("old", `${RUN}old`, { createdAt: new Date(Date.now() - 45 * DAY) });
    const robot = await mkUser("bot", `${RUN}bot`, { isBot: true });

    // 1. link generation: code once, slug claimed from username once
    const l1 = await as(alice).getMyCode();
    const l2 = await as(alice).getMyCode();
    if (/^[A-Z0-9]{6}$/.test(l1.code) && l1.code === l2.code) pass(`getMyCode generates a 6-char code once (${l1.code})`);
    else fail(`code unstable/malformed: ${l1.code} vs ${l2.code}`);
    if (l1.slug === `${RUN}alice` && l1.linkSlug === l1.slug) pass("username is claimed as the permanent slug; link uses it");
    else fail(`slug = ${l1.slug}, linkSlug = ${l1.linkSlug}`);
    if (l1.canClaimUsername === false) pass("nothing to re-claim while slug == username");
    else fail("canClaimUsername should be false");

    // 2. no-username account falls back to the code
    const lc = await as(carol).getMyCode();
    if (lc.slug === null && lc.linkSlug === lc.code) pass("account without a username gets a code link");
    else fail(`carol: ${JSON.stringify(lc)}`);

    // 3. link by username
    await as(bob).applyCode({ code: `${RUN}alice` });
    if ((await referredBy(bob)) === alice) pass("?ref=<username> credits the right referrer");
    else fail("username link did not set referredBy");

    // 4. second apply rejected
    await expectError(as(bob).applyCode({ code: `${RUN}dave` }), "already applied", "applying a second referral");

    // 5. legacy code, either case
    await as(dave).applyCode({ code: l1.code.toLowerCase() });
    if ((await referredBy(dave)) === alice) pass("6-char code works case-insensitively");
    else fail("code link did not set referredBy");

    // 6. self / garbage / @-prefixed
    await expectError(as(alice).applyCode({ code: l1.code }), "refer yourself", "self-referral");
    await expectError(as(erin).applyCode({ code: "definitely-not-a-user" }), "couldn't find", "unknown ref");
    await as(erin).applyCode({ code: `@${RUN}MIXED` });
    if ((await referredBy(erin)) === mixed) pass("mixed-case username resolves, even typed as @NAME in another case");
    else fail("mixed-case link failed");

    // 7. mutual referral blocked
    await expectError(as(alice).applyCode({ code: `${RUN}bob` }), "referred you", "mutual referral");

    // 8. apply window
    await expectError(as(oldtimer).applyCode({ code: `${RUN}alice` }), "days of joining", "account older than the window");

    // 9. bots
    await expectError(as(frank).applyCode({ code: `${RUN}bot` }), "Bot accounts", "bot as referrer");
    await expectError(as(robot).applyCode({ code: `${RUN}alice` }), "Bot accounts", "bot as referee");

    // 10. stats
    const stats = await as(alice).getStats();
    if (stats.totalReferrals === 2) pass("getStats counts alice's two referrals");
    else fail(`getStats totalReferrals = ${stats.totalReferrals}, expected 2`);

    // 11. RENAME — alice becomes alice2; her old link is out in the wild.
    await db.update(user).set({ username: `${RUN}alice2` }).where(eq(user.id, alice));
    await as(frank).applyCode({ code: `${RUN}alice` });
    if ((await referredBy(frank)) === alice) pass("old link still credits alice after her rename");
    else fail("old link broke on rename");
    // hank grabs the freed name — he must NOT inherit her link
    await db.update(user).set({ username: `${RUN}alice` }).where(eq(user.id, hank));
    await as(gina).applyCode({ code: `${RUN}alice` });
    if ((await referredBy(gina)) === alice) pass("re-registering the freed username does not hijack the link");
    else fail(`hijack: ?ref=alice credited ${(await referredBy(gina)) === hank ? "hank" : "someone else"}`);
    const lh = await as(hank).getMyCode();
    if (lh.slug === null && lh.linkSlug === lh.code && lh.usernameTakenByOther) pass("hank's link falls back to his code and the UI is told why");
    else fail(`hank: ${JSON.stringify(lh)}`);
    // alice is offered her new name and takes it
    const la = await as(alice).getMyCode();
    if (la.canClaimUsername && la.slug === `${RUN}alice`) pass("alice is offered to move her link to @alice2");
    else fail(`alice after rename: ${JSON.stringify(la)}`);
    await as(alice).claimUsernameSlug();
    const la2 = await as(alice).getMyCode();
    if (la2.slug === `${RUN}alice2` && la2.canClaimUsername === false) pass("claimUsernameSlug moves the link to the new name");
    else fail(`after claim: ${JSON.stringify(la2)}`);
    // ...which is exactly when ?ref=alice starts pointing at hank (documented consequence)
    await as(ivy).applyCode({ code: `${RUN}alice` });
    if ((await referredBy(ivy)) === hank) pass("after alice releases the old slug, the current @alice owns that name");
    else fail("released slug did not fall through to the username holder");
    // ...and hank, who holds the username now, can claim the released slug for his own link
    await as(hank).claimUsernameSlug();
    const lh2 = await as(hank).getMyCode();
    if (lh2.slug === `${RUN}alice` && lh2.linkSlug === lh2.slug) pass("released slug can be claimed by the current username holder");
    else fail(`hank after claim: ${JSON.stringify(lh2)}`);
    // but nobody can take a slug that is still held
    try {
        await db.update(user).set({ referralSlug: `${RUN}ALICE2` }).where(eq(user.id, ivy));
        fail("unique index let a second user hold the same slug (different case)");
    } catch (e) {
        const code = (e as { cause?: { code?: string } }).cause?.code;
        if (code === "23505") pass("unique lower(referral_slug) index rejects a second holder, case-insensitively");
        else fail(`expected 23505, got ${code ?? (e as Error).message}`);
    }

    // 12. rows are consistent: one referral row per referred user
    const rows = await db.select({ u: referrals.referredUserId }).from(referrals).where(inArray(referrals.referredUserId, made));
    const perUser = new Map<string, number>();
    for (const r of rows) perUser.set(r.u, (perUser.get(r.u) ?? 0) + 1);
    if ([...perUser.values()].every((n) => n === 1)) pass(`referrals table: ${rows.length} rows, one per referred user`);
    else fail("duplicate referral rows for a user");
} finally {
    if (made.length) {
        await db.delete(user).where(inArray(user.id, made));
        const [left] = await db.select({ id: referrals.id }).from(referrals).where(inArray(referrals.referredUserId, made)).limit(1);
        console.log(left ? "CLEANUP left referral rows behind" : `cleanup: ${made.length} smoke users removed, referrals cascaded`);
    }
}

console.log(failures ? `\n${failures} FAIL` : "\nall assertions passed");
process.exit(failures ? 1 : 0);
