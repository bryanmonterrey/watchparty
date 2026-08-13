// Helpers shared by the content router's split modules.

// Normalize a user-entered social link to a full URL (bare domains get https://).
// Returns null for empty input so the column stays null rather than "".
export function normalizeUrl(raw?: string): string | null {
    const v = raw?.trim();
    if (!v) return null;
    return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}
