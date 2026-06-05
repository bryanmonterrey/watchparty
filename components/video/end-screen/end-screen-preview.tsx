"use client"

import { useRef, useEffect, forwardRef, useState } from "react"
import {
  PauseIcon,
  YtCardsPlayIcon,
  YtCardsSkipBack10Icon,
  YtCardsSkipForward10Icon,
  YtCardsVolumeHighIcon,
  YtCardsSettingsIcon,
} from "@/components/icons"
import { VolumeX } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { EndScreenElement } from "./types"
import { EndScreenOverlay } from "./end-screen-overlay"

interface EndScreenPreviewProps {
  videoUrl?: string | null
  thumbnailUrl?: string | null
  currentTime: number
  duration: number
  elements: EndScreenElement[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onPatchElement: (id: string, patch: Partial<EndScreenElement>) => void
  onCommitElement: () => void
  onTimeUpdate: (t: number) => void
  onDurationChange: (d: number) => void
}

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]

export const EndScreenPreview = forwardRef<HTMLVideoElement, EndScreenPreviewProps>(
  function EndScreenPreview(
    {
      videoUrl,
      thumbnailUrl,
      currentTime,
      duration,
      elements,
      selectedId,
      onSelect,
      onPatchElement,
      onCommitElement,
      onTimeUpdate,
      onDurationChange,
    },
    ref
  ) {
    const seekedRef = useRef(false)
    const [isPlaying, setIsPlaying] = useState(false)
    const [isMuted, setIsMuted] = useState(false)
    const [playbackSpeed, setPlaybackSpeed] = useState(1)
    const [speedOpen, setSpeedOpen] = useState(false)
    const [isHoveringProgress, setIsHoveringProgress] = useState(false)

    useEffect(() => {
      const video = (ref as React.RefObject<HTMLVideoElement>)?.current
      if (!video) return
      if (Math.abs(video.currentTime - currentTime) > 0.5 && !seekedRef.current) {
        seekedRef.current = true
        video.currentTime = currentTime
        setTimeout(() => {
          seekedRef.current = false
        }, 200)
      }
    }, [currentTime, ref])

    const togglePlay = () => {
      const video = (ref as React.RefObject<HTMLVideoElement>)?.current
      if (!video) return
      if (video.paused) {
        video.play()
        setIsPlaying(true)
      } else {
        video.pause()
        setIsPlaying(false)
      }
    }

    const skip = (seconds: number) => {
      const video = (ref as React.RefObject<HTMLVideoElement>)?.current
      if (!video) return
      video.currentTime += seconds
    }

    const toggleMute = () => {
      const video = (ref as React.RefObject<HTMLVideoElement>)?.current
      if (!video) return
      video.muted = !video.muted
      setIsMuted(video.muted)
    }

    const changeSpeed = (speed: number) => {
      const video = (ref as React.RefObject<HTMLVideoElement>)?.current
      if (video) video.playbackRate = speed
      setPlaybackSpeed(speed)
      setSpeedOpen(false)
    }

    const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
      if (!duration) return
      const rect = e.currentTarget.getBoundingClientRect()
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
      const t = pct * duration
      const video = (ref as React.RefObject<HTMLVideoElement>)?.current
      if (video) video.currentTime = t
      onTimeUpdate(t)
    }

    const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0

    return (
      <div className="flex flex-col h-fit w-full items-center justify-center">
        <div className="relative bg-black overflow-hidden w-full max-w-[560px] aspect-video shadow-2xl flex flex-col group">
          {videoUrl ? (
            <video
              ref={ref}
              src={videoUrl}
              poster={thumbnailUrl ?? undefined}
              className="w-full flex-1 min-h-0 object-contain cursor-pointer"
              onTimeUpdate={(e) => onTimeUpdate(e.currentTarget.currentTime)}
              onLoadedMetadata={(e) => onDurationChange(e.currentTarget.duration)}
              onClick={togglePlay}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              controls={false}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              {thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={thumbnailUrl}
                  alt="Video thumbnail"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="text-zinc-700 text-sm">No preview</div>
              )}
            </div>
          )}

          {/* End screen overlay — always visible */}
          <EndScreenOverlay
            elements={elements}
            selectedId={selectedId}
            onSelect={onSelect}
            onPatch={onPatchElement}
            onCommit={onCommitElement}
          />

          {/* Controls overlay — progress bar + buttons */}
          <div className="absolute bottom-0 left-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity z-20">
            {/* Progress bar with scrubber thumb */}
            <div
              className="relative cursor-pointer select-none"
              style={{ height: 16, display: "flex", alignItems: "center" }}
              onClick={handleProgressClick}
              onMouseEnter={() => setIsHoveringProgress(true)}
              onMouseLeave={() => setIsHoveringProgress(false)}
            >
              <div
                className="absolute inset-x-0 rounded-full bg-white/20 overflow-hidden transition-[height] duration-150"
                style={{ height: isHoveringProgress ? 5 : 3 }}
              >
                <div
                  className="absolute inset-y-0 left-0 bg-white"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <div
                className="absolute w-3 h-3 rounded-full bg-white shadow-md pointer-events-none"
                style={{
                  left: `${progressPct}%`,
                  top: "50%",
                  transform: `translate(-50%, -50%) scale(${isHoveringProgress ? 1.4 : 1})`,
                  transition: "transform 0.15s cubic-bezier(0.05, 0, 0, 1)",
                }}
              />
            </div>

            {/* Buttons */}
            <div className="h-11 backdrop-blur-md flex items-center justify-between px-4">
              <div className="flex items-center gap-4 text-zinc-200">
                <button
                  onClick={togglePlay}
                  className="cursor-pointer p-1 hover:bg-white/10 rounded-full hover:text-white transition-colors"
                >
                  {isPlaying ? (
                    <PauseIcon className="size-6" />
                  ) : (
                    <YtCardsPlayIcon className="size-[28px]" />
                  )}
                </button>
                <button
                  onClick={() => skip(-10)}
                  className="cursor-pointer p-1 hover:bg-white/10 rounded-full hover:text-white transition-colors"
                >
                  <YtCardsSkipBack10Icon className="size-6" />
                </button>
                <button
                  onClick={() => skip(10)}
                  className="cursor-pointer p-1 hover:bg-white/10 rounded-full hover:text-white transition-colors"
                >
                  <YtCardsSkipForward10Icon className="size-6" />
                </button>
                <button
                  onClick={toggleMute}
                  className="cursor-pointer p-1 hover:bg-white/10 rounded-full hover:text-white transition-colors ml-2"
                >
                  {isMuted ? (
                    <VolumeX className="size-6" />
                  ) : (
                    <YtCardsVolumeHighIcon className="size-[28px]" />
                  )}
                </button>
              </div>
              <div className="flex items-center gap-4 text-zinc-200">
                <Popover open={speedOpen} onOpenChange={setSpeedOpen}>
                  <PopoverTrigger asChild>
                    <button className="cursor-pointer p-1 hover:bg-white/10 rounded-full hover:text-white transition-colors">
                      <YtCardsSettingsIcon className="size-6" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    side="top"
                    align="end"
                    sideOffset={8}
                    className="w-40 bg-neutral-950 border-flexborder/75 rounded-2xl shadow-[0_0_15px_5px_rgba(255,255,255,0.08)] ring ring-white/10 p-1.5 flex flex-col gap-0.5"
                  >
                    <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider px-3 py-1.5">
                      Playback speed
                    </p>
                    {SPEEDS.map((speed) => (
                      <button
                        key={speed}
                        onClick={() => changeSpeed(speed)}
                        className="flex items-center justify-between w-full px-3 py-2 text-[13px] font-medium rounded-xl hover:bg-white/5 transition-colors text-left"
                      >
                        <span className={playbackSpeed === speed ? "text-white" : "text-zinc-400"}>
                          {speed === 1 ? "Normal" : `${speed}×`}
                        </span>
                        {playbackSpeed === speed && (
                          <div className="w-1.5 h-1.5 rounded-full bg-white" />
                        )}
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }
)
