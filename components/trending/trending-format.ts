// Formatters for the trending board. Split out so the table, the row and the
// summary strip all render a number the same way.

/** $612 / $40.3K / $6.2M / $1.4B */
export function compactUsd(n: number | null | undefined): string {
    if (n == null || !Number.isFinite(n)) return "—";
    const abs = Math.abs(n);
    if (abs >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(abs >= 10_000_000_000 ? 0 : 1)}B`;
    if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
    if (abs >= 1_000) return `$${(n / 1_000).toFixed(abs >= 100_000 ? 0 : 1)}K`;
    return `$${Math.round(n)}`;
}

/**
 * Token prices span ~12 orders of magnitude, so a fixed precision is useless at
 * one end or the other. Sub-cent prices use subscript-zero notation
 * ($0.0₅1234) the way every trading UI does — plain decimals would be an
 * unreadable run of zeros exactly where memecoins live.
 */
export function tokenPrice(n: number | null | undefined): string {
    if (n == null || !Number.isFinite(n) || n <= 0) return "—";
    if (n >= 1000) return `$${Math.round(n).toLocaleString()}`;
    if (n >= 1) return `$${n.toFixed(2)}`;
    if (n >= 0.01) return `$${n.toFixed(4)}`;

    const exp = Math.floor(Math.log10(n));
    const leadingZeros = -exp - 1;
    if (leadingZeros < 4) return `$${n.toFixed(Math.min(8, leadingZeros + 4))}`;

    const digits = (n * 10 ** (leadingZeros + 4)).toFixed(0);
    return `$0.0${subscript(leadingZeros)}${digits}`;
}

const SUBSCRIPTS = "₀₁₂₃₄₅₆₇₈₉";
const subscript = (n: number) => String(n).split("").map((d) => SUBSCRIPTS[Number(d)]).join("");

/** +12.4% / -3.1% — always signed, so the direction reads without the colour. */
export function percent(n: number | null | undefined): string {
    if (n == null || !Number.isFinite(n)) return "—";
    const v = Math.abs(n) >= 1000 ? n.toFixed(0) : Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(1);
    return `${n > 0 ? "+" : ""}${v}%`;
}

/** 0.27% — magnitude only, for the board's change cell, where a direction arrow
 *  carries the sign (so "-2.01%" next to a down arrow would say it twice). */
export function percentAbs(n: number | null | undefined): string {
    if (n == null || !Number.isFinite(n)) return "—";
    const abs = Math.abs(n);
    return `${abs >= 100 ? abs.toFixed(0) : abs.toFixed(2)}%`;
}

/** 3m / 5h / 12d / 4mo — pool age, in the coarsest unit that still says something. */
export function age(at: Date | string | null | undefined): string {
    if (!at) return "—";
    const then = typeof at === "string" ? new Date(at) : at;
    if (Number.isNaN(then.getTime())) return "—";
    const mins = Math.max(0, (Date.now() - then.getTime()) / 60_000);
    if (mins < 60) return `${Math.floor(mins)}m`;
    const hours = mins / 60;
    if (hours < 24) return `${Math.floor(hours)}h`;
    const days = hours / 24;
    if (days < 30) return `${Math.floor(days)}d`;
    const months = days / 30;
    if (months < 12) return `${Math.floor(months)}mo`;
    return `${Math.floor(months / 12)}y`;
}

/** 1,204 / 18.2K — transaction counts, which get large. */
export function compactCount(n: number | null | undefined): string {
    if (n == null || !Number.isFinite(n)) return "—";
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 10_000) return `${(n / 1000).toFixed(1)}K`;
    return Math.round(n).toLocaleString();
}

/** Tailwind text colour for a signed change. Neutral at exactly 0/unknown so a
 *  dead coin doesn't read as green. */
export function changeTone(n: number | null | undefined): string {
    if (n == null || !Number.isFinite(n) || n === 0) return "text-zinc-500";
    return n > 0 ? "text-jewel" : "text-pastelred";
}
