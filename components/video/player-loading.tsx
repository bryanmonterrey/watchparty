// A screen loads like a player, not like a document: black, with the spinner —
// never a shimmer skeleton. A pulsing grey block promises a layout; a black
// frame with a spinner promises a video, which is what actually arrives.
//
// Markup and classes are the `ytp-spinner` the full player uses (styles live in
// globals.css), so every loading screen in the app reads identically. Home's
// hero, the video page and the live page all render this.

/** Just the spinner. Position it yourself. */
export function PlayerSpinner() {
    return (
        <div className="ytp-spinner">
            <div className="ytp-spinner-container">
                <div className="ytp-spinner-rotator">
                    <div className="ytp-spinner-left">
                        <div className="ytp-spinner-circle" />
                    </div>
                    <div className="ytp-spinner-right">
                        <div className="ytp-spinner-circle" />
                    </div>
                </div>
            </div>
        </div>
    );
}

/** Fills a sized slot — for a parent that already owns the 16:9 box. */
export function PlayerLoadingOverlay() {
    return (
        <div className="absolute inset-0 flex items-center justify-center bg-black">
            <PlayerSpinner />
        </div>
    );
}

/** Owns its own 16:9 box — for a player rendering its own loading state. */
export function PlayerLoadingScreen() {
    return (
        /* relative is LOAD-BEARING: .ytp-spinner is position:absolute at
           50%/50% (globals.css), so without a positioned box here it centers
           against the nearest positioned ANCESTOR — in /home's loading shell
           that was the whole column, and the spinner hovered over the board
           skeletons instead of the black frame. */
        <div className="relative flex aspect-video w-full items-center justify-center bg-black">
            <PlayerSpinner />
        </div>
    );
}
