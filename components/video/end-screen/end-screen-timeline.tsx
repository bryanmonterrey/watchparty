"use client"

import { useRef, useCallback, useState } from "react"
import { UndoIcon, RedoIcon, ShortsIcon, MusicIcon } from "@/components/icons"
import { Slider } from "@/components/ui/slider"
import { SearchMinusIcon, SearchPlusIcon } from "@/components/icons"
import { cn } from "@/lib/utils"
import { EndScreenElement, ELEMENT_TYPE_LABELS, ELEMENT_COLORS } from "./types"

interface EndScreenTimelineProps {
  elements: EndScreenElement[]
  currentTime: number
  duration: number
  thumbnailUrl?: string | null
  selectedId: string | null
  onSelect: (id: string | null) => void
  onSeek: (t: number) => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
}

function formatTime(s: number): string {
  if (isNaN(s) || s === 0) return "00:00"
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
}

const RULER_TICKS = [0, 0.25, 0.5, 0.75, 1]

function VideoTrackStrip({
  thumbnailUrl,
  currentTime,
  duration,
  onSeek,
}: {
  thumbnailUrl?: string | null
  currentTime: number
  duration: number
  onSeek: (t: number) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)
  const dragStartX = useRef(0)
  const dragStartTime = useRef(0)
  const onSeekRef = useRef(onSeek)
  onSeekRef.current = onSeek

  const numTiles = Math.max(12, Math.ceil(duration / 5))

  return (
    <div
      ref={containerRef}
      className="flex-1 relative flex overflow-hidden z-20 cursor-grab active:cursor-grabbing"
      onPointerDown={(e) => {
        const rect = containerRef.current?.getBoundingClientRect()
        if (!rect || duration === 0) return
        isDragging.current = true
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
        const t = pct * duration
        onSeekRef.current(t)
        dragStartX.current = e.clientX
        dragStartTime.current = t
      }}
      onPointerMove={(e) => {
        if (!isDragging.current) return
        const rect = containerRef.current?.getBoundingClientRect()
        if (!rect || duration === 0) return
        const deltaX = e.clientX - dragStartX.current
        const newTime = Math.max(
          0,
          Math.min(duration, dragStartTime.current + (deltaX / rect.width) * duration)
        )
        onSeekRef.current(newTime)
      }}
      onPointerUp={(e) => {
        isDragging.current = false
        ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
      }}
      onPointerCancel={(e) => {
        isDragging.current = false
        ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
      }}
    >
      {Array.from({ length: numTiles }).map((_, i) => (
        <div
          key={i}
          className="flex-1 h-full border-r border-black/40 flex-shrink-0"
          style={{
            backgroundImage: thumbnailUrl ? `url(${thumbnailUrl})` : undefined,
            backgroundColor: "#1c1c1e",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
      ))}
    </div>
  )
}

export function EndScreenTimeline({
  elements,
  currentTime,
  duration,
  thumbnailUrl,
  selectedId,
  onSelect,
  onSeek,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: EndScreenTimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  const [hoverFraction, setHoverFraction] = useState<number | null>(null)

  const toPercent = (t: number) => (duration > 0 ? (t / duration) * 100 : 0)

  const handleTracksMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = trackRef.current?.getBoundingClientRect()
      if (!rect || duration === 0) {
        setHoverFraction(null)
        return
      }
      if (e.clientX < rect.left || e.clientX > rect.right) {
        setHoverFraction(null)
        return
      }
      setHoverFraction(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)))
    },
    [duration]
  )

  const handleTrackClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = trackRef.current?.getBoundingClientRect()
      if (!rect || duration === 0) return
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
      onSeek(pct * duration)
    },
    [duration, onSeek]
  )

  const handlePlayheadDrag = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.stopPropagation()
      const rect = trackRef.current?.getBoundingClientRect()
      if (!rect || duration === 0) return
      const move = (ev: MouseEvent) => {
        const pct = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width))
        onSeek(pct * duration)
      }
      const up = () => {
        window.removeEventListener("mousemove", move)
        window.removeEventListener("mouseup", up)
      }
      window.addEventListener("mousemove", move)
      window.addEventListener("mouseup", up)
    },
    [duration, onSeek]
  )

  const trackScale = `${zoom * 100}%`

  return (
    <div className="flex-shrink-0 flex flex-col bg-black select-none">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 pt-2 pb-4">
        <div className="flex items-center gap-3">
          <div className="px-3 py-1.5 bg-zinc-900/60 rounded-lg text-sm font-medium text-zinc-300 border border-flexborder/40">
            {formatTime(currentTime)}
          </div>
          <div className="flex items-center gap-1">
            <button
              className="flex items-center bg-white/15 disabled:bg-white/15 gap-2 px-4 py-2 text-md font-bold text-zinc-400 hover:text-white hover:bg-white/8 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              disabled={!canUndo}
              onClick={onUndo}
            >
              <UndoIcon className="size-5" /> Undo
            </button>
            <button
              className="flex items-center bg-white/15 disabled:bg-white/15 gap-3 px-4 py-2 text-md font-bold text-zinc-400 hover:text-white hover:bg-white/8 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              disabled={!canRedo}
              onClick={onRedo}
            >
              <RedoIcon className="size-5" /> Redo
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <SearchMinusIcon className="size-5.5 text-zinc-500" />
          <div className="w-36 flex items-center">
            <Slider
              value={zoom}
              onChange={(v) => setZoom(v as number)}
              min={1}
              max={5}
              step={0.25}
              showValue={false}
              hideFill
              thumbColor="white"
              trackClassName="bg-zinc-700/60 border-zinc-600/30"
            />
          </div>
          <SearchPlusIcon className="size-5.5 text-zinc-500" />
        </div>
      </div>

      {/* Scrollable timeline */}
      <div className="overflow-x-auto scrollbar-hide">
        <div style={{ minWidth: trackScale }}>
          {/* Ruler */}
          <div className="flex flex-row h-9 border-b border-flexborder/60">
            <div className="w-28 relative flex-shrink-0 sticky left-0 bg-black z-20" />
            <div className="px-12 w-full flex">
              <div className="flex-1 relative">
                {RULER_TICKS.map((pct) => (
                  <div
                    key={pct}
                    className="absolute top-0 flex flex-row gap-1 items-start"
                    style={{ left: `${pct * 100}%` }}
                  >
                    <div className="w-px h-9 bg-flexborder/60" />
                    <span className="text-xs leading-none text-zinc-500 tabular-nums mt-1">
                      {duration > 0 ? formatTime(duration * pct) : "--:--"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Tracks */}
          <div
            className="flex flex-col relative"
            onMouseMove={handleTracksMouseMove}
            onMouseLeave={() => setHoverFraction(null)}
          >
            {/* Click-to-seek overlay */}
            <div
              ref={trackRef}
              className="absolute top-0 bottom-0 z-10 cursor-crosshair"
              style={{ left: "160px", right: "48px" }}
              onClick={handleTrackClick}
            />

            {/* Element tracks */}
            {elements.map((el) => {
              const isSelected = el.id === selectedId
              const color = ELEMENT_COLORS[el.type]
              const barLeft = toPercent(el.startTime)
              const barWidth = toPercent(el.endTime - el.startTime)

              return (
                <div key={el.id} className="flex h-[44px] border-b border-flexborder/60">
                  {/* Label column */}
                  <div
                    className="w-28 flex items-center px-3 border-r border-flexborder/60 flex-shrink-0 bg-black z-20 sticky left-0 gap-2"
                  >
                    <div
                      className="size-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-xs text-zinc-400 truncate">
                      {ELEMENT_TYPE_LABELS[el.type].replace(" element", "")}
                    </span>
                  </div>

                  {/* Bar area */}
                  <div className="px-12 w-full flex py-2">
                    <div className="flex-1 relative">
                      <button
                        className={cn(
                          "absolute top-0 h-full rounded transition-opacity cursor-pointer flex items-center px-2 overflow-hidden",
                          isSelected ? "opacity-90" : "opacity-60 hover:opacity-80"
                        )}
                        style={{
                          left: `${barLeft}%`,
                          width: `${barWidth}%`,
                          backgroundColor: color,
                        }}
                        onClick={(e) => {
                          e.stopPropagation()
                          onSelect(isSelected ? null : el.id)
                        }}
                      >
                        <span className="text-white text-xs font-medium truncate whitespace-nowrap">
                          {el.title || ELEMENT_TYPE_LABELS[el.type]}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}

            {/* Video filmstrip track */}
            <div className="flex h-[52px] border-b border-flexborder/60">
              <div className="w-28 flex bg-black z-20 items-center px-3 border-r border-flexborder/60 text-zinc-500 flex-shrink-0 sticky left-0">
                <ShortsIcon className="size-5.5" />
              </div>
              <div className="px-12 w-full flex py-2">
                <VideoTrackStrip
                  thumbnailUrl={thumbnailUrl}
                  currentTime={currentTime}
                  duration={duration}
                  onSeek={onSeek}
                />
              </div>
            </div>

            {/* Audio waveform track */}
            <div className="flex h-[52px] border-b border-flexborder/60">
              <div className="w-28 flex bg-black items-center px-3 border-r border-flexborder/60 text-zinc-500 flex-shrink-0 bg-black z-20 sticky left-0">
                <MusicIcon className="size-5.5" />
              </div>
              <div className="px-12 w-full flex py-2">
                <div className="flex-1 bg-black relative overflow-hidden flex items-center px-2">
                  <div className="w-full h-full flex items-center gap-[2px] py-2">
                    {Array.from({ length: 120 }).map((_, i) => {
                      const h =
                        20 +
                        Math.sin(i * 0.4) * 10 +
                        Math.sin(i * 1.3) * 8 +
                        Math.sin(i * 2.7) * 5
                      return (
                        <div
                          key={i}
                          className="flex-1 bg-zinc-600/60 rounded-full"
                          style={{ height: `${Math.max(10, Math.min(90, h))}%` }}
                        />
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Hover scrubber */}
            {hoverFraction !== null && duration > 0 && (
              <div
                className="absolute top-0 bottom-0 w-[2px] bg-white/40 z-[25] pointer-events-none"
                style={{
                  left: `calc(160px + ${hoverFraction} * (100% - 208px))`,
                }}
              >
                <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-white text-black text-[11px] font-semibold px-2 py-0.5 rounded-sm whitespace-nowrap shadow-sm">
                  {formatTime(hoverFraction * duration)}
                </div>
              </div>
            )}

            {/* Global playhead */}
            {duration > 0 && (
              <div
                className="absolute top-0 bottom-0 w-[2px] hover:cursor-grab active:cursor-grabbing bg-white z-30"
                style={{
                  left: `calc(160px + ${toPercent(currentTime) / 100} * (100% - 208px))`,
                }}
                onMouseDown={handlePlayheadDrag}
              >
                <div
                  className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 hover:cursor-grab active:cursor-grabbing rounded-full bg-white shadow-lg pointer-events-auto"
                  onMouseDown={handlePlayheadDrag}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
