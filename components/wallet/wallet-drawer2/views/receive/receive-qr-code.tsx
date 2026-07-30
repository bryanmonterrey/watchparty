"use client";

import * as React from "react";
import QRCodeStyling from "qr-code-styling";

interface ReceiveQrCodeProps {
    walletAddress: string;
}

// The brand star, inlined as a data URI rather than fetched from /public: the
// QR is drawn in an effect, and a network round trip would land the mark a
// frame or more after the code. Path is StarLogo1 from components/icons.tsx.
const STAR_MARK = `<svg xmlns="http://www.w3.org/2000/svg" width="557" height="571" viewBox="0 0 557 571" fill="none"><path d="M315.259 10.9117C340.87 -11.8573 381.524 3.01674 386.393 36.9378L404.27 161.47C406.146 174.54 413.924 186.024 425.366 192.617L534.628 255.575C564.631 272.863 562.937 316.713 531.69 331.635L419.379 385.268C407.315 391.029 398.617 402.073 395.844 415.151L370.064 536.722C362.927 570.38 321.115 582.441 297.148 557.755L208.726 466.68C199.597 457.277 186.679 452.55 173.638 453.842L47.3172 466.348C13.078 469.738 -11.0779 433.541 5.19178 403.224L63.9567 293.722C70.2783 281.942 70.7614 267.892 65.2641 255.706L14.0848 142.256C-0.154465 110.692 26.8507 76.1023 60.9265 82.2592L185.02 104.68C198.014 107.028 211.367 103.276 221.236 94.5019L315.259 10.9117Z" fill="#FDF6DA"/></svg>`;
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
                // so the mark reads cleanly. "H" recovers 30% of the code, well
                // clear of what this mark plus its margin covers — decode-tested
                // against solana/evm/bitcoin/sui address lengths.
                hideBackgroundDots: true,
                imageSize: 0.36,
                margin: 4,
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
                className="bg-zinc-900/5 p-1/2 rounded-[32px] border border-zinc-800/60 shadow-xl"
            />
        </div>
    );
}
