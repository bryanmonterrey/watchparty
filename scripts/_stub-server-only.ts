// Bun preload: stub the `server-only` marker package to an empty module so
// server-side scripts (e.g. scripts/premium/*) can import code that guards
// itself with `import "server-only"`. Use via:
//   bun --preload ./scripts/_stub-server-only.ts <script>
import { plugin } from "bun";

plugin({
    name: "stub-server-only",
    setup(build) {
        build.module("server-only", () => ({ exports: {}, loader: "object" }));
    },
});
