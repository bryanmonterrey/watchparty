/**
 * Credit amounts: cents for a dollar and up, three decimals below — a key
 * that has spent $0.004 must not render as "$0.00" (rule ported from the
 * interim portal's console-view).
 */
export function money(usd: number): string {
  if (usd >= 1) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(Math.round(usd * 100) / 100);
  }
  return `$${usd.toFixed(3)}`;
}

export function formatDate(d: Date | string): string {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateTime(d: Date | string): string {
  return new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Truncated tx signature for table cells: first 8 + last 4. */
export function shortSig(sig: string): string {
  return sig.length <= 14 ? sig : `${sig.slice(0, 8)}…${sig.slice(-4)}`;
}
