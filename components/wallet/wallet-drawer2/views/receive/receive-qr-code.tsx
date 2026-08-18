"use client";

import * as React from "react";
import QRCodeStyling from "qr-code-styling";

interface ReceiveQrCodeProps {
    walletAddress: string;
}

// The pink brand star, inlined as a data URI rather than fetched from /public:
// the QR is drawn in an effect, and a network round trip would land the mark a
// frame or more after the code. Path is PinkStarLogo from components/icons.tsx,
// pastel-peach fill preserved.
//
// The viewBox is NOT the path's own 0 0 554 564. A five-pointed star's optical
// centre is its area centroid, not its bounding-box centre, and those differ
// here by 17.4 units left and 6.9 up (measured: centroid 259.56,275.08 against
// a box centre of 277,282) — which is why the mark read left of centre inside
// the QR even though its box was centred. This window is centred on the
// centroid and widened to still contain the whole path, so no point clips; the
// star renders ~5.7% smaller at the same box size, which is invisible at this
// scale and errs the safe way for scannability.
const STAR_MARK = `<svg xmlns="http://www.w3.org/2000/svg" width="587.21" height="576.54" viewBox="-34.05 -13.19 587.21 576.54" fill="none"><path d="M324.642 11.001C355.155 -13.7306 400.907 5.69008 404.312 44.8189L414.088 157.151C415.397 172.193 423.568 185.792 436.235 194.01L530.828 255.378C563.779 276.754 559.447 326.268 523.285 341.598L419.472 385.608C405.57 391.501 395.162 403.475 391.261 418.061L362.127 526.989C351.979 564.932 303.55 576.113 277.796 546.459L203.86 461.326C193.959 449.926 179.356 443.727 164.277 444.524L51.6782 450.477C12.4563 452.551 -13.1427 409.947 7.10175 376.29L65.2201 279.665C73.0027 266.726 74.3854 250.922 68.9679 236.828L28.5111 131.579C14.4187 94.9178 47.0271 57.4062 85.2931 66.2592L195.148 91.6744C209.859 95.0778 225.317 91.509 237.047 82.0013L324.642 11.001Z" fill="#FCE0CB"/></svg>`;
const STAR_DATA_URI = `data:image/svg+xml,${encodeURIComponent(STAR_MARK)}`;

export function ReceiveQrCode({ walletAddress }: ReceiveQrCodeProps) {
    const qrCodeRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        if (!qrCodeRef.current) return;

        const qrCode = new QRCodeStyling({
            width: 224,
            height: 224,
            type: "svg",
            data: walletAddress,
            margin: 2,
            image: STAR_DATA_URI,
            qrOptions: {
                typeNumber: 0,
                mode: "Byte",
                errorCorrectionLevel: "H",
            },
            imageOptions: {
                // Clears the dots behind the star instead of drawing over them,
                // so the mark reads cleanly. Small, with a wide clear margin —
                // the star should sit in its own space rather than crowd the
                // code. "H" recovers 30%, well clear of what this covers;
                // decode-tested against solana/evm/bitcoin/sui address lengths.
                hideBackgroundDots: true,
                imageSize: 0.22,
                margin: 8,
            },
            dotsOptions: {
                type: "dots",
                color: "#ffffff",
            },
            backgroundOptions: {
                color: "#ffffff0c", // matching new modal bg
            },
            cornersSquareOptions: {
                type: "extra-rounded",
                color: "#ffffff",
            },
            cornersDotOptions: {
                type: "dot",
                color: "#ffffff",
            },
        });

        qrCodeRef.current.innerHTML = "";
        qrCode.append(qrCodeRef.current);

        // Add rounded corners to the SVG
        const svg = qrCodeRef.current.querySelector("svg");
        if (svg) {
            svg.style.borderRadius = "32px"; // matching new card radii
            // Remove the hardcoded inline background to let the options handle it cleanly
            svg.style.backgroundColor = "transparent";
        }
    }, [walletAddress]);

    return (
        <div className="flex justify-center mb-8">
            <div
                ref={qrCodeRef}
                className="bg-white/[0.02] p-1/2 rounded-[32px] border border-baseborder/20"
            />
        </div>
    );
}
