// Upload limits live in ONE place so client-side guards can't drift from the
// Supabase project's actual storage `fileSizeLimit`.
//
// History (2026-07-22): the project limit sat at Supabase's 50MB default while
// the client claimed a 100GB max, so any real 1080p video was accepted by the
// UI and then killed ~20s into the transfer with an opaque `400`. The project
// limit is now 5GB. If you change it (Supabase → Storage → Settings, or
// PATCH /v1/projects/{ref}/config/storage), change these to match.

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024 * 1024;
export const MAX_UPLOAD_LABEL = "5GB";

export function formatFileSize(bytes: number): string {
    if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)}GB`;
    if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)}MB`;
    if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`;
    return `${bytes}B`;
}
