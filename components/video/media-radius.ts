// The corner radius every video surface shares: the home hero, the video page's
// player and the live player.
//
// Its own module, not an export from home-carousel2 where it started, because
// importing a constant out of that file would pull the whole carousel into the
// streaming and watch-page bundles for the sake of one string — exactly what the
// speed rule in CLAUDE.md exists to prevent.
//
// APPLY IT TWICE: once on the container and once on the media inside it.
//
// That duplication is load-bearing, not belt-and-braces. All three players run
// in ambient mode, and an ambient container CANNOT be overflow-hidden — the glow
// canvas is injected as the video's sibling and clipping erases the effect. So
// the container's radius has nothing to clip, and the media paints its own
// square corners on top of it. That's invisible for a letterboxed source
// (object-contain keeps the frame off the corners, so the container's rounded
// bg-muted shows through) and obvious the moment a frame fills the box edge to
// edge. Rounding the media itself fixes it without reintroducing a clip.
export const MEDIA_RADIUS = "rounded-xl";
