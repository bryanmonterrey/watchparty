"use client";

import { useCallback, useEffect, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { HugeiconsIcon } from "@hugeicons/react";
import { MinusSignIcon, PlusSignIcon } from "@hugeicons/core-free-icons";

// Pan/zoom image cropper (X/Telegram model): the crop window is fixed, the
// IMAGE moves — drag to pan, wheel/pinch or the slider to zoom. No crop
// rectangle, no corner handles. Round 1:1 by default (avatars); pass
// aspect/shape/output for banners etc.

async function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

// croppedAreaPixels is in the source image's natural pixel space.
export async function getCroppedDataUrl(
    imageSrc: string,
    area: Area,
    output: { width: number; height: number } = { width: 512, height: 512 },
): Promise<string> {
    const img = await loadImage(imageSrc);
    const canvas = document.createElement("canvas");
    canvas.width = output.width;
    canvas.height = output.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas context unavailable");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, output.width, output.height);
    return canvas.toDataURL("image/png");
}

export function AvatarCropper({
    file,
    onAreaChange,
    aspect = 1,
    shape = "round",
}: {
    file: File;
    onAreaChange: (imageSrc: string, area: Area) => void;
    aspect?: number;
    shape?: "round" | "rect";
}) {
    const [imgSrc, setImgSrc] = useState("");
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);

    useEffect(() => {
        const reader = new FileReader();
        reader.addEventListener("load", () => setImgSrc(reader.result?.toString() || ""));
        reader.readAsDataURL(file);
    }, [file]);

    const handleComplete = useCallback(
        (_: Area, areaPixels: Area) => {
            if (imgSrc) onAreaChange(imgSrc, areaPixels);
        },
        [imgSrc, onAreaChange],
    );

    return (
        <div className="flex flex-col gap-4">
            {/* Stage — fixed circular window, image pans/zooms underneath */}
            <div className="relative h-[320px] w-full overflow-hidden rounded-[24px] bg-black">
                {imgSrc && (
                    <Cropper
                        image={imgSrc}
                        crop={crop}
                        zoom={zoom}
                        minZoom={1}
                        maxZoom={4}
                        aspect={aspect}
                        cropShape={shape}
                        showGrid={false}
                        onCropChange={setCrop}
                        onZoomChange={setZoom}
                        onCropComplete={handleComplete}
                        classes={{
                            containerClassName: "!bg-black",
                            cropAreaClassName: "!border-2 !border-white/80 !shadow-[0_0_0_9999px_rgba(0,0,0,0.7)]",
                        }}
                    />
                )}
            </div>

            {/* Zoom */}
            <div className="flex items-center gap-3 px-1">
                <HugeiconsIcon icon={MinusSignIcon} className="size-4 shrink-0 text-zinc-500" strokeWidth={2} />
                <input
                    type="range"
                    min={1}
                    max={4}
                    step={0.01}
                    value={zoom}
                    aria-label="Zoom"
                    onChange={(e) => setZoom(Number(e.target.value))}
                    className="h-1 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-white
                        [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none
                        [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white
                        [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full
                        [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white"
                />
                <HugeiconsIcon icon={PlusSignIcon} className="size-4 shrink-0 text-zinc-500" strokeWidth={2} />
            </div>
        </div>
    );
}
