// Which routes the coin alerts rail holds its full width on when collapsed.
//
// Shared by the rail itself (home-left-rail.tsx) and the placeholder that
// stands in for it before its chunk arrives (home-left-rail-lazy.tsx). The
// two MUST agree: the placeholder's job is to occupy exactly the width the
// real rail will, so the centre column never resizes when the rail lands.
// Kept in its own tiny module because the lazy wrapper cannot import from
// home-left-rail.tsx without pulling the heavy chunk back onto the critical
// path it exists to keep it off.
//
// Home and the token page give the reclaimed 244px to a column that can use
// it. The feed's column can't — it IS the 628px reading measure at every
// width — so there the rail holds w-72 and empties to the expand control,
// and nothing outside it moves. /status is the post page, which shares the
// feed's exact columns via feed-frame.tsx: checking only /feed is how it
// regressed to sliding sideways after posts moved off /feed/post.
export function railKeepsWidth(pathname: string | null | undefined): boolean {
    return (pathname?.startsWith("/feed") || pathname?.startsWith("/status")) ?? false;
}
