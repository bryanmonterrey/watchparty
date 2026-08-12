"use client"

import { useState } from "react"
import { Plus, Pencil, Video, ListVideo, Bell, User, Link } from "lucide-react"
import { cn } from "@/lib/utils"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { Checkbox } from "@/components/ui/checkbox"
import {
  EndScreenElement,
  EndScreenElementType,
  ELEMENT_TYPE_LABELS,
  ELEMENT_COLORS,
  TEMPLATES,
  TemplateElement,
} from "./types"

interface EndScreenPanelProps {
  elements: EndScreenElement[]
  selectedId: string | null
  duration: number
  onSelect: (id: string | null) => void
  onAdd: (type: EndScreenElementType) => void
  onDelete: (id: string) => void
  onPatch: (id: string, patch: Partial<EndScreenElement>) => void
  onCommit: () => void
  onApplyTemplate: (elements: TemplateElement[]) => void
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, "0")}`
}

function parseTime(s: string): number | null {
  const parts = s.split(":").map(Number)
  if (parts.some(isNaN) || parts.length < 2) return null
  return parts.length === 3
    ? parts[0] * 3600 + parts[1] * 60 + parts[2]
    : parts[0] * 60 + parts[1]
}

function TimeInput({
  value,
  onChange,
}: {
  value: number
  onChange: (v: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [raw, setRaw] = useState("")

  const handleFocus = () => {
    setEditing(true)
    setRaw(formatTime(value))
  }

  const handleBlur = () => {
    setEditing(false)
    const parsed = parseTime(raw)
    if (parsed !== null) onChange(parsed)
  }

  return (
    <input
      className="bg-zinc-800 border border-flexborder/60 rounded px-2 py-1 text-xs text-white w-14 text-center"
      value={editing ? raw : formatTime(value)}
      onFocus={handleFocus}
      onChange={(e) => setRaw(e.target.value)}
      onBlur={handleBlur}
    />
  )
}

const ELEMENT_ICONS: Record<EndScreenElementType, React.ReactNode> = {
  video: <Video className="size-4" />,
  playlist: <ListVideo className="size-4" />,
  subscribe: <Bell className="size-4" />,
  channel: <User className="size-4" />,
  link: <Link className="size-4" />,
}

// Template positions are percentage of overlay (0–100 both axes).
// SVG viewBox is "0 0 100 56.25" (16:9), so y/height must be scaled by 56.25/100.
const S = 56.25 / 100

function TemplateThumbnail({ elements }: { elements: TemplateElement[] }) {
  return (
    <div className="relative w-full aspect-video bg-[#282828] border border-white/10 rounded-md overflow-hidden transition-colors group-hover:border-white/30">
      <svg
        viewBox="0 0 100 56.25"
        className="absolute inset-0 w-full h-full"
        xmlns="http://www.w3.org/2000/svg"
      >
        {elements.map((el, i) => {
          if (el.type === "subscribe" || el.type === "channel") {
            const cx = el.x + el.width / 2
            const r = Math.min(el.width, el.height * S) / 2
            const cy = el.y * S + r
            return (
              <circle key={i} cx={cx} cy={cy} r={r} fill="#888888" />
            )
          }
          return (
            <rect
              key={i}
              x={el.x}
              y={el.y * S}
              width={el.width}
              height={el.height * S}
              fill="#888888"
            />
          )
        })}
      </svg>

      {/* Hover overlay — + icon */}
      <div className="absolute inset-0 bg-transparent group-hover:bg-black/60 transition-colors flex items-center justify-center">
        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            height="32"
            viewBox="0 0 24 24"
            width="32"
            className="fill-white drop-shadow-md"
            aria-hidden="true"
          >
            <path d="M12 3a1 1 0 00-1 1v7H4a1 1 0 000 2h7v7a1 1 0 002 0v-7h7a1 1 0 000-2h-7V4a1 1 0 00-1-1Z" />
          </svg>
        </div>
      </div>
    </div>
  )
}

function VideoElementForm({
  el,
  onPatch,
  onCommit,
}: {
  el: EndScreenElement
  onPatch: (id: string, patch: Partial<EndScreenElement>) => void
  onCommit: () => void
}) {
  const options: { value: "recent" | "best_for_viewer" | "specific"; label: string; description: string }[] = [
    {
      value: "recent",
      label: "Most recent upload",
      description: "Automatically feature the most recently uploaded long form video",
    },
    {
      value: "best_for_viewer",
      label: "Best for viewer",
      description: "Allow YouTube to select a video from your channel to best suit the viewer",
    },
    {
      value: "specific",
      label: "Choose specific video",
      description: "Select from your videos, or from any video on YouTube",
    },
  ]

  const current = el.videoMode ?? "best_for_viewer"

  return (
    <div className="px-5 py-4 flex flex-col gap-3">
      {options.map((opt) => (
        <label
          key={opt.value}
          className={cn(
            "flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors",
            current === opt.value
              ? "border-bleu/60 bg-bleu/10"
              : "border-flexborder/40 hover:border-flexborder/80"
          )}
        >
          <input
            type="radio"
            className="mt-0.5 accent-bleu"
            checked={current === opt.value}
            onChange={() => {
              onPatch(el.id, { videoMode: opt.value })
              onCommit()
            }}
          />
          <div className="flex flex-col gap-0.5">
            <span className="text-sm text-white font-medium">{opt.label}</span>
            <span className="text-xs text-zinc-500 leading-relaxed">{opt.description}</span>
          </div>
        </label>
      ))}
    </div>
  )
}

function SubscribeElementForm({
  el,
  onPatch,
  onCommit,
}: {
  el: EndScreenElement
  onPatch: (id: string, patch: Partial<EndScreenElement>) => void
  onCommit: () => void
}) {
  return (
    <div className="px-5 py-4 flex flex-col gap-4">
      <input
        className="bg-zinc-900 border border-flexborder/60 rounded-xl px-4 py-3 text-sm text-white w-full outline-none focus:border-flexborder"
        value={el.subscribeLabel ?? "Subscribe"}
        placeholder="Subscribe label"
        onChange={(e) => onPatch(el.id, { subscribeLabel: e.target.value })}
        onBlur={onCommit}
      />
      <label className="flex items-center gap-3 cursor-pointer">
        <Checkbox
          checked={el.showHovercardOutline ?? false}
          onCheckedChange={(v) => {
            onPatch(el.id, { showHovercardOutline: v === true })
            onCommit()
          }}
        />
        <span className="text-sm text-zinc-300">Show hovercard outline</span>
      </label>
    </div>
  )
}

function PlaylistElementForm({
  el,
}: {
  el: EndScreenElement
  onPatch: (id: string, patch: Partial<EndScreenElement>) => void
  onCommit: () => void
}) {
  return (
    <div className="px-5 py-4">
      <div className="flex items-center gap-2 bg-zinc-900 border border-flexborder/60 rounded-xl px-4 py-3">
        <span className="text-sm text-white flex-1 truncate">
          {el.title || "No playlist selected"}
        </span>
        <button className="text-zinc-500 hover:text-white transition-colors">
          <Pencil className="size-4" />
        </button>
      </div>
    </div>
  )
}

function ChannelElementForm({
  el,
}: {
  el: EndScreenElement
  onPatch: (id: string, patch: Partial<EndScreenElement>) => void
  onCommit: () => void
}) {
  return (
    <div className="px-5 py-4">
      <div className="flex items-center gap-2 bg-zinc-900 border border-flexborder/60 rounded-xl px-4 py-3">
        <span className="text-sm text-white flex-1 truncate">
          {el.title || "No channel selected"}
        </span>
        <button className="text-zinc-500 hover:text-white transition-colors">
          <Pencil className="size-4" />
        </button>
      </div>
    </div>
  )
}

function LinkElementForm({
  el,
  onPatch,
  onCommit,
}: {
  el: EndScreenElement
  onPatch: (id: string, patch: Partial<EndScreenElement>) => void
  onCommit: () => void
}) {
  return (
    <div className="px-5 py-4 flex flex-col gap-3">
      <input
        className="bg-zinc-900 border border-flexborder/60 rounded-xl px-4 py-3 text-sm text-white w-full outline-none focus:border-flexborder"
        placeholder="URL"
        value={el.url ?? ""}
        onChange={(e) => onPatch(el.id, { url: e.target.value })}
        onBlur={onCommit}
      />
      <input
        className="bg-zinc-900 border border-flexborder/60 rounded-xl px-4 py-3 text-sm text-white w-full outline-none focus:border-flexborder"
        placeholder="Title"
        value={el.title ?? ""}
        onChange={(e) => onPatch(el.id, { title: e.target.value })}
        onBlur={onCommit}
      />
    </div>
  )
}

function ElementDetailPanel({
  el,
  onDelete,
  onPatch,
  onCommit,
}: {
  el: EndScreenElement
  onDelete: (id: string) => void
  onPatch: (id: string, patch: Partial<EndScreenElement>) => void
  onCommit: () => void
}) {
  const color = ELEMENT_COLORS[el.type]

  return (
    <div className="flex flex-col flex-1 overflow-y-auto">
      {/* Element header */}
      <div className="px-5 py-3 border-b border-flexborder/60 flex items-center gap-3">
        <div
          className="size-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: color }}
        />
        <span className="text-sm font-semibold text-zinc-300 flex-1">
          {ELEMENT_TYPE_LABELS[el.type]}
        </span>
        <div className="flex items-center gap-2">
          <TimeInput
            value={el.startTime}
            onChange={(v) => {
              onPatch(el.id, { startTime: v })
              onCommit()
            }}
          />
          <span className="text-zinc-600 text-xs">–</span>
          <TimeInput
            value={el.endTime}
            onChange={(v) => {
              onPatch(el.id, { endTime: v })
              onCommit()
            }}
          />
          <button
            onClick={() => onDelete(el.id)}
            className="ml-1 text-zinc-500 hover:text-red-400 transition-colors p-1 rounded-lg hover:bg-red-400/10"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 6h18M19 6l-1 14H6L5 6M8 6V4h8v2" />
            </svg>
          </button>
        </div>
      </div>

      {/* Form body by type */}
      {el.type === "video" && (
        <VideoElementForm el={el} onPatch={onPatch} onCommit={onCommit} />
      )}
      {el.type === "subscribe" && (
        <SubscribeElementForm el={el} onPatch={onPatch} onCommit={onCommit} />
      )}
      {el.type === "playlist" && (
        <PlaylistElementForm el={el} onPatch={onPatch} onCommit={onCommit} />
      )}
      {el.type === "channel" && (
        <ChannelElementForm el={el} onPatch={onPatch} onCommit={onCommit} />
      )}
      {el.type === "link" && (
        <LinkElementForm el={el} onPatch={onPatch} onCommit={onCommit} />
      )}
    </div>
  )
}

function TemplatePicker({
  onApplyTemplate,
}: {
  onApplyTemplate: (elements: TemplateElement[]) => void
}) {
  return (
    <div className="p-5 flex flex-col overflow-y-auto">
      <div className="grid grid-cols-2 gap-x-4 gap-y-6">
        {TEMPLATES.map((template, i) => (
          <button
            key={i}
            onClick={() => onApplyTemplate(template.elements)}
            className="group flex flex-col items-stretch gap-2.5 cursor-pointer outline-none"
          >
            <TemplateThumbnail elements={template.elements} />
            <span className="text-[13px] text-zinc-200 text-left leading-tight">
              {template.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

export function EndScreenPanel({
  elements,
  selectedId,
  onSelect,
  onAdd,
  onDelete,
  onPatch,
  onCommit,
  onApplyTemplate,
}: EndScreenPanelProps) {
  const [popoverOpen, setPopoverOpen] = useState(false)

  const selectedElement = elements.find((el) => el.id === selectedId) ?? null

  const subscribeCount = elements.filter((el) => el.type === "subscribe").length
  const channelCount = elements.filter((el) => el.type === "channel").length
  const isAtMax = elements.length >= 4

  const typeOptions: { type: EndScreenElementType; label: string; disabled: boolean }[] = [
    { type: "video", label: "Video", disabled: isAtMax },
    { type: "playlist", label: "Playlist", disabled: isAtMax },
    { type: "subscribe", label: "Subscribe", disabled: isAtMax || subscribeCount >= 1 },
    { type: "channel", label: "Channel", disabled: isAtMax || channelCount >= 1 },
    { type: "link", label: "Link", disabled: isAtMax },
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-2 flex items-center justify-between flex-shrink-0">
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <button
              disabled={isAtMax}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-colors",
                isAtMax
                  ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                  : "bg-white/10 hover:bg-white/20 text-white"
              )}
            >
              <Plus className="size-4" />
              Element
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-48 p-1 bg-zinc-900 border-flexborder/60 rounded-xl shadow-xl"
          >
            <div className="flex flex-col gap-0.5">
              {typeOptions.map(({ type, label, disabled }) => (
                <button
                  key={type}
                  disabled={disabled}
                  onClick={() => {
                    if (!disabled) {
                      onAdd(type)
                      setPopoverOpen(false)
                    }
                  }}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors text-left",
                    disabled
                      ? "text-zinc-600 cursor-not-allowed"
                      : "text-zinc-300 hover:text-white hover:bg-white/10"
                  )}
                >
                  <span
                    className="flex-shrink-0"
                    style={{ color: disabled ? undefined : ELEMENT_COLORS[type] }}
                  >
                    {ELEMENT_ICONS[type]}
                  </span>
                  {label}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {!selectedElement ? (
          <button
            className="px-4 py-2 rounded-full text-sm font-medium bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            Import from video
          </button>
        ) : (
          <button
            onClick={() => onSelect(null)}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Back to templates
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {selectedElement ? (
          <ElementDetailPanel
            el={selectedElement}
            onDelete={onDelete}
            onPatch={onPatch}
            onCommit={onCommit}
          />
        ) : (
          <TemplatePicker onApplyTemplate={onApplyTemplate} />
        )}
      </div>
    </div>
  )
}
