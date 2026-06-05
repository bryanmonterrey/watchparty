"use client";

import * as React from "react";
import QRCodeStyling from "qr-code-styling";

interface ReceiveQrCodeProps {
    walletAddress: string;
}

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
            qrOptions: {
                typeNumber: 0,
                mode: "Byte",
                errorCorrectionLevel: "H",
            },
            imageOptions: {
                hideBackgroundDots: true,
                imageSize: 0.4,
                margin: 1,
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
