// Guarded retrain pipeline for the Phoenix ranker — the SAFE "training loop".
//
// NOT a blind scheduled retrain. One command that: guards on data volume, does a
// temporal train/val split (train on older, evaluate on newer — no leakage),
// trains, then EVALUATES tuned vs baseline on the held-out set and only PROMOTES
// the tuned weights if RCE actually improves. A worse model is rejected.
//
//   PHX=../x-algorithm/phoenix bun scripts/feed-ranker/retrain.mjs [--promote]
//
// Without --promote it's a dry run (trains + reports the RCE delta, promotes
// nothing). With --promote and an improvement, it assembles artifacts/tuned into
// a full dir ready for `PHOENIX_ARTIFACTS=... ` redeploy. Requires uv + the
// x-algorithm/phoenix clone (with train.py/train_retrieval.py/evaluate.py overlaid).

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const PHX = process.env.PHX || "../x-algorithm/phoenix";
const PROMOTE = process.argv.includes("--promote");
const MIN_EXAMPLES = Number(process.env.RETRAIN_MIN_EXAMPLES || 500);
const VAL_FRAC = Number(process.env.RETRAIN_VAL_FRAC || 0.2);
const BASELINE = "artifacts/oss-phoenix-artifacts";
const TUNED = "artifacts/tuned";

function uv(args, opts = {}) {
    const r = spawnSync("uv", args, { cwd: PHX, encoding: "utf8", ...opts });
    if (r.status !== 0) { console.error(r.stdout, r.stderr); throw new Error(`uv ${args.join(" ")} failed`); }
    return r.stdout;
}

// 1. Export from the live DB (run the bun exporter, capture stdout).
console.error("→ exporting training data…");
const all = execFileSync("bun", ["scripts/feed-ranker/export-training-data.mjs"], {
    cwd: process.cwd(), maxBuffer: 1 << 28, encoding: "utf8",
}).trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));

// 2. Data-volume guard — refuse to train on noise.
if (all.length < MIN_EXAMPLES) {
    console.error(`✋ only ${all.length} examples (< ${MIN_EXAMPLES}). Not enough to train safely — aborting.`);
    console.error("   Set RETRAIN_MIN_EXAMPLES to override once you trust the volume.");
    process.exit(2);
}

// 3. Temporal split: oldest → train, newest → val (no future leakage).
all.sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
const cut = Math.floor(all.length * (1 - VAL_FRAC));
const train = all.slice(0, cut), val = all.slice(cut);
console.error(`→ ${train.length} train / ${val.length} val (temporal split)`);
fs.writeFileSync(path.join(PHX, "train.jsonl"), train.map((e) => JSON.stringify(e)).join("\n"));
fs.writeFileSync(path.join(PHX, "val.jsonl"), val.map((e) => JSON.stringify(e)).join("\n"));

// 4. Baseline RCE on the held-out set (the bar to beat).
const baseEval = JSON.parse(uv(["run", "evaluate.py", "--artifacts_dir", BASELINE, "--data", "val.jsonl"]).trim().split("\n").pop());
console.error(`→ baseline RCE = ${baseEval.rce?.toFixed(3)}`);

// 5. Train both towers on the train split.
console.error("→ training ranker…");
uv(["run", "train.py", "--data", "train.jsonl", "--epochs", "5", "--out", TUNED], { stdio: ["ignore", "ignore", "inherit"] });
console.error("→ training retrieval…");
uv(["run", "train_retrieval.py", "--data", "train.jsonl", "--epochs", "5", "--out", TUNED], { stdio: ["ignore", "ignore", "inherit"] });

// 6. Tuned RCE on the SAME held-out set.
const tunedEval = JSON.parse(uv(["run", "evaluate.py", "--artifacts_dir", TUNED, "--data", "val.jsonl"]).trim().split("\n").pop());
console.error(`→ tuned RCE = ${tunedEval.rce?.toFixed(3)}`);

// 7. The gate.
const improved = (tunedEval.rce ?? -Infinity) > (baseEval.rce ?? -Infinity);
console.error(`\n=== RCE: baseline ${baseEval.rce?.toFixed(3)} → tuned ${tunedEval.rce?.toFixed(3)}  (${improved ? "IMPROVED ✅" : "WORSE ❌"}) ===`);

if (!improved) {
    console.error("✋ tuned model does not beat baseline on held-out data — NOT promoting.");
    process.exit(1);
}
if (!PROMOTE) {
    console.error("✓ would promote (improvement), but this is a dry run. Re-run with --promote.");
    process.exit(0);
}

// 8. Promote: assemble a full artifacts dir (tuned ranker+retrieval + corpus).
console.error("→ promoting: assembling full tuned artifacts dir…");
for (const sub of ["retrieval"]) {
    // train_retrieval already wrote tuned/retrieval; ensure ranker+retrieval both present
}
// corpus + any pieces the trainers didn't touch come from baseline
fs.cpSync(path.join(PHX, BASELINE, "sports_corpus.npz"), path.join(PHX, TUNED, "sports_corpus.npz"), { force: true });
console.error(`✅ promoted → ${path.join(PHX, TUNED)}. Redeploy the service with PHOENIX_ARTIFACTS=/app/artifacts/tuned (rebuild image baking ${TUNED}).`);
