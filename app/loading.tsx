// App-wide route-loading fallback: the pink star from the header (the mark next
// to the menu trigger) spinning on a bare canvas. Deliberately a server
// component with the path inlined rather than the `PinkStarLogo` icon — that one
// is "use client" (motion/react), and a loading screen should ship zero JS and
// paint before any bundle lands. Animation lives in globals.css (`.star-loader`).
export default function Loading() {
    return (
        <div
            role="status"
            aria-label="loading"
            className="fixed inset-0 z-50 grid place-items-center bg-background"
        >
            <div className="star-loader">
                {/* Verbatim path from public/pinkstarlogo.svg. */}
                <svg
                    width="52"
                    height="53"
                    viewBox="0 0 554 564"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <path
                        d="M324.642 11.001C355.155 -13.7306 400.907 5.69008 404.312 44.8189L414.088 157.151C415.397 172.193 423.568 185.792 436.235 194.01L530.828 255.378C563.779 276.754 559.447 326.268 523.285 341.598L419.472 385.608C405.57 391.501 395.162 403.475 391.261 418.061L362.127 526.989C351.979 564.932 303.55 576.113 277.796 546.459L203.86 461.326C193.959 449.926 179.356 443.727 164.277 444.524L51.6782 450.477C12.4563 452.551 -13.1427 409.947 7.10175 376.29L65.2201 279.665C73.0027 266.726 74.3854 250.922 68.9679 236.828L28.5111 131.579C14.4187 94.9178 47.0271 57.4062 85.2931 66.2592L195.148 91.6744C209.859 95.0778 225.317 91.509 237.047 82.0013L324.642 11.001Z"
                        fill="#FCE0CB"
                    />
                </svg>
            </div>
        </div>
    );
}
