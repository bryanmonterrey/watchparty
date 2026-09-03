// Typed, capped readers over the query string. Every template reads its
// fields through these so the caps live in one place.
export class Q {
    constructor(private p: URLSearchParams) {}
    s(key: string, max = 200): string {
        return (this.p.get(key) ?? "").slice(0, max).trim();
    }
    n(key: string): number | null {
        const raw = this.p.get(key);
        if (raw == null || raw === "") return null;
        const v = Number(raw);
        return Number.isFinite(v) ? v : null;
    }
    b(key: string): boolean {
        const v = this.p.get(key);
        return v === "1" || v === "true";
    }
    /** Comma-separated numbers, capped in count. */
    nums(key: string, max = 256): number[] {
        return (this.p.get(key) ?? "")
            .split(",")
            .slice(0, max)
            .map((x) => Number(x))
            .filter((x) => Number.isFinite(x));
    }
    url(key: string): string | null {
        const v = this.s(key, 2048);
        return v && /^(https?:\/\/|data:image\/)/.test(v) ? v : null;
    }
}
