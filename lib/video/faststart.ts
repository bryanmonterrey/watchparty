// Move an MP4's `moov` atom in front of its `mdat` — "faststart" — in the
// browser, before upload, without reading the media into memory.
//
// Why this exists (2026-09-04): every video uploaded so far had `moov` at the
// END of the file, which is how downloaders and most encoders write it. A
// player then has to fetch the tail before it can decode frame one, and
// Safari in particular gives up on that dance now and then with
// MEDIA_ERR_SRC_NOT_SUPPORTED — "Video format not supported" — for a file
// that plays fine on the next refresh. With `moov` first, every browser
// starts from byte zero, and Safari has nothing to give up on.
//
// The layout change is the classic qt-faststart: copy `moov` to just before
// `mdat`, and add its size to every chunk offset (`stco`/`co64`) that pointed
// past the insertion point. Media bytes are never touched — the output is a
// Blob of slices over the input plus one patched `moov` buffer, so a 2 GB
// upload costs a few hundred KB of memory.
//
// Anything unexpected — not an MP4, compressed `cmov`, an offset that would
// overflow 32 bits — returns the input untouched. This is an optimisation,
// never a gate.

export interface Atom {
    type: string;
    offset: number;
    size: number;
    headerLen: number;
}

const CONTAINERS = new Set(["moov", "trak", "mdia", "minf", "stbl"]);

async function readBytes(blob: Blob, start: number, end: number): Promise<DataView<ArrayBuffer>> {
    // Typed on ArrayBuffer (not ArrayBufferLike): the patched moov goes back
    // out as a BlobPart, which a SharedArrayBuffer-typed view cannot be.
    return new DataView(await blob.slice(start, Math.min(end, blob.size)).arrayBuffer());
}

/** Top-level atoms of an MP4 Blob, or null when it does not parse as one. */
export async function readTopLevelAtoms(blob: Blob): Promise<Atom[] | null> {
    const atoms: Atom[] = [];
    let offset = 0;
    while (offset + 8 <= blob.size) {
        const head = await readBytes(blob, offset, offset + 16);
        if (head.byteLength < 8) return null;
        let size = head.getUint32(0);
        const type = String.fromCharCode(head.getUint8(4), head.getUint8(5), head.getUint8(6), head.getUint8(7));
        let headerLen = 8;
        if (size === 1) {
            if (head.byteLength < 16) return null;
            const large = head.getBigUint64(8);
            if (large > BigInt(Number.MAX_SAFE_INTEGER)) return null;
            size = Number(large);
            headerLen = 16;
        } else if (size === 0) {
            size = blob.size - offset;
        }
        if (size < headerLen || offset + size > blob.size) return null;
        if (!/^[\x20-\x7e]{4}$/.test(type)) return null;
        atoms.push({ type, offset, size, headerLen });
        offset += size;
    }
    return atoms.length && atoms[0].type === "ftyp" ? atoms : null;
}

/** Atoms inside a container's body, parsed from an in-memory buffer. */
function childAtoms(view: DataView, start: number, end: number): Atom[] {
    const out: Atom[] = [];
    let offset = start;
    while (offset + 8 <= end) {
        let size = view.getUint32(offset);
        const type = String.fromCharCode(
            view.getUint8(offset + 4), view.getUint8(offset + 5), view.getUint8(offset + 6), view.getUint8(offset + 7),
        );
        let headerLen = 8;
        if (size === 1) {
            size = Number(view.getBigUint64(offset + 8));
            headerLen = 16;
        } else if (size === 0) {
            size = end - offset;
        }
        if (size < headerLen || offset + size > end) break;
        out.push({ type, offset, size, headerLen });
        offset += size;
    }
    return out;
}

/**
 * Add `delta` to every chunk offset in `moov` (in place) that is >= `from`.
 * Returns false when the moov cannot be patched safely.
 */
export function patchChunkOffsets(moov: DataView, from: number, delta: number): boolean {
    const walk = (start: number, end: number): boolean => {
        for (const a of childAtoms(moov, start, end)) {
            const body = a.offset + a.headerLen;
            if (a.type === "cmov") return false; // compressed moov: not handled
            if (CONTAINERS.has(a.type)) {
                if (!walk(body, a.offset + a.size)) return false;
                continue;
            }
            if (a.type === "stco" || a.type === "co64") {
                const count = moov.getUint32(body + 4);
                const width = a.type === "stco" ? 4 : 8;
                if (body + 8 + count * width > a.offset + a.size) return false;
                for (let i = 0; i < count; i++) {
                    const at = body + 8 + i * width;
                    if (width === 4) {
                        const v = moov.getUint32(at);
                        if (v < from) continue;
                        const next = v + delta;
                        if (next > 0xffffffff || next < 0) return false;
                        moov.setUint32(at, next);
                    } else {
                        const v = moov.getBigUint64(at);
                        if (v < BigInt(from)) continue;
                        const next = v + BigInt(delta);
                        if (next < BigInt(0)) return false;
                        moov.setBigUint64(at, next);
                    }
                }
            }
        }
        return true;
    };
    return walk(0, moov.byteLength);
}

/**
 * The same media with `moov` ahead of `mdat`. Returns the input itself when
 * it already is, or when anything about the file is not what this expects.
 */
export async function faststart(blob: Blob): Promise<Blob> {
    try {
        const atoms = await readTopLevelAtoms(blob);
        if (!atoms) return blob;
        const moov = atoms.find((a) => a.type === "moov");
        const mdat = atoms.find((a) => a.type === "mdat");
        if (!moov || !mdat || moov.offset < mdat.offset) return blob;

        const view = await readBytes(blob, moov.offset, moov.offset + moov.size);
        if (view.byteLength !== moov.size) return blob;
        // Offsets that pointed at or past where moov is being inserted move
        // by moov's own size. Everything in mdat qualifies; nothing before
        // the insertion point does.
        if (!patchChunkOffsets(view, mdat.offset, moov.size)) return blob;

        const parts: BlobPart[] = [blob.slice(0, mdat.offset), view.buffer];
        for (const a of atoms) {
            if (a.offset < mdat.offset || a === moov) continue;
            parts.push(blob.slice(a.offset, a.offset + a.size));
        }
        return new Blob(parts, { type: blob.type });
    } catch {
        return blob;
    }
}

/** `faststart`, keeping the File's name/type so upload fingerprints still match. */
export async function faststartFile(file: File): Promise<File> {
    const out = await faststart(file);
    if (out === file) return file;
    return new File([out], file.name, { type: file.type, lastModified: file.lastModified });
}
