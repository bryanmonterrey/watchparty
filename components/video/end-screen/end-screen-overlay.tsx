"use client"

import { useRef, useCallback } from "react"
import { cn } from "@/lib/utils"
import { EndScreenElement, ELEMENT_COLORS } from "./types"

interface EndScreenOverlayProps {
  elements: EndScreenElement[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onPatch: (id: string, patch: Partial<EndScreenElement>) => void
  onCommit: () => void
}

type Corner = "nw" | "ne" | "sw" | "se"

function clamp(val: number, min: number, max: number) {
  return Math.min(max, Math.max(min, val))
}

export function EndScreenOverlay({
  elements,
  selectedId,
  onSelect,
  onPatch,
  onCommit,
}: EndScreenOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  const handleBackgroundClick = useCallback(() => {
    onSelect(null)
  }, [onSelect])

  const handleElementMouseDown = useCallback(
    (e: React.MouseEvent, el: EndScreenElement) => {
      e.stopPropagation()
      onSelect(el.id)

      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return

      const origX = el.x
      const origY = el.y
      const mouseStartX = e.clientX
      const mouseStartY = e.clientY

      const onMove = (ev: MouseEvent) => {
        const dxPct = ((ev.clientX - mouseStartX) / rect.width) * 100
        const dyPct = ((ev.clientY - mouseStartY) / rect.height) * 100
        const newX = clamp(origX + dxPct, 0, 100 - el.width)
        const newY = clamp(origY + dyPct, 0, 100 - el.height)
        onPatch(el.id, { x: newX, y: newY })
      }

      const onUp = () => {
        window.removeEventListener("mousemove", onMove)
        window.removeEventListener("mouseup", onUp)
        onCommit()
      }

      window.addEventListener("mousemove", onMove)
      window.addEventListener("mouseup", onUp)
    },
    [onSelect, onPatch, onCommit]
  )

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent, el: EndScreenElement, corner: Corner) => {
      e.stopPropagation()
      e.preventDefault()

      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return

      const origEl = { ...el }
      const mouseStartX = e.clientX
      const mouseStartY = e.clientY

      const onMove = (ev: MouseEvent) => {
        const dxPct = ((ev.clientX - mouseStartX) / rect.width) * 100
        const dyPct = ((ev.clientY - mouseStartY) / rect.height) * 100

        let { x, y, width, height } = origEl

        if (corner === "se") {
          width = clamp(width + dxPct, 8, 100 - x)
          height = clamp(height + dyPct, 8, 100 - y)
        } else if (corner === "sw") {
          const newWidth = clamp(width - dxPct, 8, 100)
          const newX = clamp(x + dxPct, 0, x + width - 8)
          x = newX
          width = newWidth
          height = clamp(height + dyPct, 8, 100 - y)
        } else if (corner === "ne") {
          width = clamp(width + dxPct, 8, 100 - x)
          const newHeight = clamp(height - dyPct, 8, 100)
          const newY = clamp(y + dyPct, 0, y + height - 8)
          y = newY
          height = newHeight
        } else if (corner === "nw") {
          const newWidth = clamp(width - dxPct, 8, 100)
          const newX = clamp(x + dxPct, 0, x + width - 8)
          const newHeight = clamp(height - dyPct, 8, 100)
          const newY = clamp(y + dyPct, 0, y + height - 8)
          x = newX
          y = newY
          width = newWidth
          height = newHeight
        }

        onPatch(el.id, { x, y, width, height })
      }

      const onUp = () => {
        window.removeEventListener("mousemove", onMove)
        window.removeEventListener("mouseup", onUp)
        onCommit()
      }

      window.addEventListener("mousemove", onMove)
      window.addEventListener("mouseup", onUp)
    },
    [onPatch, onCommit]
  )

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      onClick={handleBackgroundClick}
    >
      {/* Grid overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-10"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(23, 1fr)",
          gap: "3px",
        }}
      >
        {Array.from({ length: 23 }).map((_, i) => (
          <div key={i} className="bg-white/20" />
        ))}
      </div>

      {/* Elements */}
      {elements.map((el) => {
        const isSelected = el.id === selectedId
        const color = ELEMENT_COLORS[el.type]

        return (
          <div
            key={el.id}
            className="absolute"
            style={{
              left: `${el.x}%`,
              top: `${el.y}%`,
              width: `${el.width}%`,
              height: `${el.height}%`,
              cursor: "move",
            }}
            onMouseDown={(e) => handleElementMouseDown(e, el)}
          >
            {el.type === "video" || el.type === "playlist" ? (
              <VideoPlaylistElement el={el} isSelected={isSelected} color={color} />
            ) : el.type === "subscribe" || el.type === "channel" ? (
              <SubscribeChannelElement el={el} isSelected={isSelected} color={color} />
            ) : (
              <LinkElement el={el} isSelected={isSelected} color={color} />
            )}

            {/* Resize handles (only when selected) */}
            {isSelected && (
              <>
                {/* NW */}
                <div
                  className="absolute bg-white border border-zinc-400 cursor-nw-resize z-10"
                  style={{ width: 8, height: 8, top: -4, left: -4 }}
                  onMouseDown={(e) => handleResizeMouseDown(e, el, "nw")}
                />
                {/* NE */}
                <div
                  className="absolute bg-white border border-zinc-400 cursor-ne-resize z-10"
                  style={{ width: 8, height: 8, top: -4, right: -4 }}
                  onMouseDown={(e) => handleResizeMouseDown(e, el, "ne")}
                />
                {/* SW */}
                <div
                  className="absolute bg-white border border-zinc-400 cursor-sw-resize z-10"
                  style={{ width: 8, height: 8, bottom: -4, left: -4 }}
                  onMouseDown={(e) => handleResizeMouseDown(e, el, "sw")}
                />
                {/* SE */}
                <div
                  className="absolute bg-white border border-zinc-400 cursor-se-resize z-10"
                  style={{ width: 8, height: 8, bottom: -4, right: -4 }}
                  onMouseDown={(e) => handleResizeMouseDown(e, el, "se")}
                />
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}

function VideoPlaylistElement({
  el,
  isSelected,
  color,
}: {
  el: EndScreenElement
  isSelected: boolean
  color: string
}) {
  return (
    <div
      className="w-full h-full relative overflow-hidden flex items-center justify-center rounded-sm"
      style={{
        backgroundColor: `${color}33`,
        border: isSelected ? `2px solid ${color}` : `1px dashed ${color}`,
      }}
    >
      {el.thumbnailUrl ? (
        <img
          src={el.thumbnailUrl}
          alt={el.title ?? el.type}
          className="w-full h-full object-cover"
          draggable={false}
        />
      ) : (
        <span
          className="text-xs font-semibold uppercase tracking-wide select-none"
          style={{ color }}
        >
          {el.type}
        </span>
      )}
    </div>
  )
}

function SubscribeChannelElement({
  el,
  isSelected,
  color,
}: {
  el: EndScreenElement
  isSelected: boolean
  color: string
}) {
  const label = el.subscribeLabel ?? el.title ?? (el.type === "subscribe" ? "Subscribe" : "Channel")
  const firstLetter = label.charAt(0).toUpperCase()

  return (
    <div className="w-full h-full flex flex-col items-center justify-start pt-1">
      {/* Circle */}
      <div
        className="flex-shrink-0 rounded-full flex items-center justify-center"
        style={{
          width: "60%",
          aspectRatio: "1",
          backgroundColor: `${color}4d`,
          border: isSelected ? `2px solid ${color}` : `1px dashed ${color}`,
        }}
      >
        <span
          className="font-bold text-sm select-none"
          style={{ color }}
        >
          {firstLetter}
        </span>
      </div>
      {/* Label */}
      <span
        className="mt-1 text-xs font-medium text-center leading-tight select-none px-1 truncate w-full text-center"
        style={{ color: "white" }}
      >
        {label}
      </span>
    </div>
  )
}

function LinkElement({
  el,
  isSelected,
  color,
}: {
  el: EndScreenElement
  isSelected: boolean
  color: string
}) {
  return (
    <div
      className="w-full h-full flex items-center justify-center gap-1 rounded-sm"
      style={{
        backgroundColor: `${color}33`,
        border: isSelected ? `2px solid ${color}` : `1px dashed ${color}`,
      }}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
      <span className="text-xs font-medium select-none truncate" style={{ color }}>
        {el.title ?? "Link"}
      </span>
    </div>
  )
}
