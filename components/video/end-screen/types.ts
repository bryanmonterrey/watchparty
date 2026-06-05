export type EndScreenElementType = "video" | "playlist" | "subscribe" | "channel" | "link"

export interface EndScreenElement {
  id: string
  type: EndScreenElementType
  // Position & size as percentage of overlay (0–100)
  x: number
  y: number
  width: number
  height: number
  // Timing (seconds)
  startTime: number
  endTime: number
  // Content
  title?: string
  url?: string
  thumbnailUrl?: string | null
  videoMode?: "recent" | "best_for_viewer" | "specific"
  subscribeLabel?: string
  showHovercardOutline?: boolean
}

export const ELEMENT_TYPE_LABELS: Record<EndScreenElementType, string> = {
  video: "Video element",
  playlist: "Playlist element",
  subscribe: "Subscribe element",
  channel: "Channel element",
  link: "Link element",
}

// Default sizes as percentage of overlay
export const ELEMENT_DEFAULTS: Record<EndScreenElementType, { width: number; height: number }> = {
  video:     { width: 34,   height: 19.5 },
  playlist:  { width: 34,   height: 19.5 },
  subscribe: { width: 15,   height: 27   },
  channel:   { width: 15,   height: 27   },
  link:      { width: 22,   height: 10   },
}

export const ELEMENT_COLORS: Record<EndScreenElementType, string> = {
  video:     "#3b82f6",
  playlist:  "#8b5cf6",
  subscribe: "#ef4444",
  channel:   "#f59e0b",
  link:      "#10b981",
}

// Template presets (element positions/sizes as % of overlay)
export interface TemplateElement {
  type: EndScreenElementType
  x: number; y: number; width: number; height: number
}

export const TEMPLATES: { label: string; elements: TemplateElement[] }[] = [
  {
    label: "1 video, 1 subscribe",
    elements: [
      { type: "video",     x: 5,  y: 55, width: 30, height: 16.875 },
      { type: "subscribe", x: 75, y: 55, width: 17, height: 16.875 },
    ],
  },
  {
    label: "1 video, 1 subscribe",
    elements: [
      { type: "video",     x: 5,  y: 10, width: 30, height: 16.875 },
      { type: "subscribe", x: 75, y: 10, width: 17, height: 16.875 },
    ],
  },
  {
    label: "1 video, 1 subscribe",
    elements: [
      { type: "subscribe", x: 5,  y: 40, width: 17, height: 16.875 },
      { type: "video",     x: 65, y: 40, width: 30, height: 16.875 },
    ],
  },
  {
    label: "2 videos",
    elements: [
      { type: "video",     x: 5,    y: 35, width: 42.5, height: 24 },
      { type: "video",     x: 52.5, y: 35, width: 42.5, height: 24 },
    ],
  },
  {
    label: "2 videos",
    elements: [
      { type: "video",     x: 5,  y: 40, width: 30, height: 16.875 },
      { type: "video",     x: 65, y: 40, width: 30, height: 16.875 },
    ],
  },
  {
    label: "1 video, 1 playlist, 1 subscribe",
    elements: [
      { type: "video",     x: 5,  y: 15, width: 33, height: 18.5 },
      { type: "playlist",  x: 5,  y: 55, width: 33, height: 18.5 },
      { type: "subscribe", x: 75, y: 40, width: 17, height: 16.875 },
    ],
  },
]
