"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface MediaItem {
  type: "image" | "video";
  url: string;
}

interface MediaGridProps {
  media: MediaItem[];
  onImageClick?: (index: number) => void;
  onImageError?: (index: number) => void;
}

export function MediaGrid({ media, onImageClick, onImageError }: MediaGridProps) {
  const [loaded, setLoaded] = useState<boolean[]>(new Array(media.length).fill(false));

  if (!media || media.length === 0) return null;

  const handleLoad = (index: number) => {
    setLoaded((prev) => {
      const next = [...prev];
      next[index] = true;
      return next;
    });
  };

  const count = media.length;

  return (
    <div 
      className={cn(
        "relative rounded-2xl overflow-hidden border border-white/10",
        count === 1 ? "w-fit max-w-full overflow-hidden" : "w-full aspect-[16/9] grid gap-0.5 bg-zinc-900/50"
      )}
    >
      {count === 1 && (
        <div 
          className="cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            onImageClick?.(0);
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={media[0].url}
            alt="Post media"
            className={cn(
              "w-auto h-auto max-w-full max-h-[460px] object-contain bg-zinc-900/20",
              loaded[0] ? "opacity-100" : "opacity-100"
            )}
            style={{ aspectRatio: "auto" }}
            onLoad={() => handleLoad(0)}
            onError={() => onImageError?.(0)}
          />
        </div>
      )}

      {count === 2 && (
        <div className="grid grid-cols-2 h-full w-full gap-0.5">
          {media.slice(0, 2).map((item, i) => (
            <div 
              key={i} 
              className="relative w-full h-full cursor-pointer overflow-hidden"
              onClick={(e) => {
                e.stopPropagation();
                onImageClick?.(i);
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.url}
                alt={`Media ${i + 1}`}
                className={cn(
                  "w-full h-full object-cover",
                  loaded[i] ? "opacity-100" : "opacity-100"
                )}
                onLoad={() => handleLoad(i)}
                onError={() => onImageError?.(i)}
              />
            </div>
          ))}
        </div>
      )}

      {count === 3 && (
        <div className="grid grid-cols-2 h-full w-full gap-0.5">
          {/* Large hero on left */}
          <div 
            className="relative h-full cursor-pointer overflow-hidden border-r border-white/5"
            onClick={(e) => {
              e.stopPropagation();
              onImageClick?.(0);
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={media[0].url}
              alt="Media 1"
              className={cn(
                "w-full h-full object-cover",
                loaded[0] ? "opacity-100" : "opacity-100"
              )}
              onLoad={() => handleLoad(0)}
              onError={() => onImageError?.(0)}
            />
          </div>
          {/* Two stacked siblings on right */}
          <div className="grid grid-rows-2 h-full gap-0.5">
            {media.slice(1, 3).map((item, i) => (
              <div 
                key={i + 1} 
                className={cn(
                  "relative w-full h-full cursor-pointer overflow-hidden",
                  i === 0 ? "border-b border-white/5" : ""
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  onImageClick?.(i + 1);
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.url}
                  alt={`Media ${i + 2}`}
                  className={cn(
                    "w-full h-full object-cover",
                    loaded[i + 1] ? "opacity-100" : "opacity-100"
                  )}
                  onLoad={() => handleLoad(i + 1)}
                  onError={() => onImageError?.(i + 1)}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {count >= 4 && (
        <div className="grid grid-cols-2 grid-rows-2 h-full w-full gap-0.5">
          {media.slice(0, 4).map((item, i) => (
            <div 
              key={i} 
              className="relative w-full h-full cursor-pointer overflow-hidden"
              onClick={(e) => {
                e.stopPropagation();
                onImageClick?.(i);
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.url}
                alt={`Media ${i + 1}`}
                className={cn(
                  "w-full h-full object-cover",
                  loaded[i] ? "opacity-100" : "opacity-100"
                )}
                onLoad={() => handleLoad(i)}
                onError={() => onImageError?.(i)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
