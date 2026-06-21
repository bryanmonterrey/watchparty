import "server-only";
import type { Ad } from "./types";

// Bridges OpenAdServer's JSON creatives into the VAST/VMAP XML that Google IMA
// (the player's existing ad path) consumes. The ad server returns a plain
// video_url + tracking pixels; we wrap them in a standards-compliant document so
// the built-out player (countdown, cue points, skip, mid-roll discard) just works.

function esc(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** A single VAST 3.0 InLine linear ad (no XML prolog — embeddable in VMAP). */
function vastInline(ad: Ad, id: string): string {
    const c = ad.creative;
    return `<VAST version="3.0"><Ad id="${esc(id)}"><InLine>` +
        `<AdSystem>watchparty</AdSystem>` +
        `<AdTitle><![CDATA[${c.title ?? "Sponsored"}]]></AdTitle>` +
        `<Impression><![CDATA[${ad.tracking.impression_url}]]></Impression>` +
        `<Creatives><Creative><Linear>` +
        `<Duration>00:00:30</Duration>` +
        `<VideoClicks>` +
        `<ClickThrough><![CDATA[${c.landing_url}]]></ClickThrough>` +
        `<ClickTracking><![CDATA[${ad.tracking.click_url}]]></ClickTracking>` +
        `</VideoClicks>` +
        `<MediaFiles>` +
        `<MediaFile delivery="progressive" type="video/mp4" width="640" height="360">` +
        `<![CDATA[${c.video_url}]]></MediaFile>` +
        `</MediaFiles>` +
        `</Linear></Creative></Creatives>` +
        `</InLine></Ad></VAST>`;
}

/** Standalone VAST document for a single preroll (XML prolog included). */
export function buildVast(ad: Ad | null): string {
    const head = `<?xml version="1.0" encoding="UTF-8"?>`;
    if (!ad?.creative.video_url) return `${head}<VAST version="3.0"></VAST>`;
    return head + vastInline(ad, "preroll");
}

export interface AdBreak {
    /** "start" | "end" | percentage like "50%" | "HH:MM:SS" */
    offset: string;
    id: string;
    ad: Ad;
}

/** VMAP wrapping one or more ad breaks (preroll + optional midroll). */
export function buildVmap(breaks: AdBreak[]): string {
    const valid = breaks.filter((b) => b.ad.creative.video_url);
    const body = valid
        .map(
            (b) =>
                `<vmap:AdBreak timeOffset="${esc(b.offset)}" breakType="linear" breakId="${esc(b.id)}">` +
                `<vmap:AdSource id="${esc(b.id)}-src" allowMultipleAds="false" followRedirects="true">` +
                `<vmap:VASTAdData>${vastInline(b.ad, b.id)}</vmap:VASTAdData>` +
                `</vmap:AdSource></vmap:AdBreak>`,
        )
        .join("");
    return `<?xml version="1.0" encoding="UTF-8"?>` +
        `<vmap:VMAP xmlns:vmap="http://www.iab.net/videosuite/vmap" version="1.0">${body}</vmap:VMAP>`;
}
