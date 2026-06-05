"use client"

import { useState, useCallback, useRef } from "react"
import { Monitor } from "lucide-react"
import { EndScreenPanel } from "./end-screen-panel"
import { EndScreenPreview } from "./end-screen-preview"
import { EndScreenTimeline } from "./end-screen-timeline"
import { useEndScreen } from "./use-end-screen"
import type { EndScreenElement, EndScreenElementType, TemplateElement } from "./types"

interface EndScreenEditorProps {
  open: boolean
  onClose: () => void
  postId?: string
  videoUrl?: string | null
  thumbnailUrl?: string | null
  onDraftChange?: (elements: EndScreenElement[]) => void
  initialElements?: EndScreenElement[]
}

// ── Shared shell ──────────────────────────────────────────────────────────────

function EditorShell({
  onClose,
  onSave,
  panelSlot,
  previewSlot,
  timelineSlot,
}: {
  onClose: () => void
  onSave?: () => void
  panelSlot: React.ReactNode
  previewSlot: React.ReactNode
  timelineSlot: React.ReactNode
}) {
  return (
    <div className="absolute inset-0 z-10 bg-black flex flex-col overflow-hidden rounded-4xl shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-[14px] border-b border-flexborder/60 flex-shrink-0">
        <div className="flex items-center gap-4">
          <Monitor className="size-6 text-[#aaaaaa]" />
          <span className="text-[#f1f1f1] text-[20px] font-medium tracking-normal">
            End screen
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="px-4 py-3 cursor-pointer text-md font-medium text-white bg-white/15 hover:bg-white/20 rounded-full transition-colors h-[36px] flex items-center justify-center"
          >
            Discard changes
          </button>
          <button
            onClick={onSave}
            disabled={!onSave}
            className="px-4 py-3 cursor-pointer text-md font-medium bg-white text-[#030303] hover:bg-gray-200 rounded-full transition-colors disabled:opacity-30 disabled:bg-white/20 disabled:text-white/50 h-[36px] flex items-center justify-center"
          >
            Save
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="relative overflow-hidden bg-black flex-1">
        {/* Preview on the right */}
        <div className="ml-[320px] flex items-start justify-center overflow-hidden bg-black border-l border-flexborder/60">
          {previewSlot}
        </div>

        {/* Panel on the left */}
        <div className="absolute inset-y-0 left-0 w-[320px] flex flex-col overflow-hidden bg-black overflow-y-auto">
          {panelSlot}
        </div>
      </div>

      {/* Timeline */}
      <div className="border-t border-flexborder/60 flex-shrink-0 bg-black">
        {timelineSlot}
      </div>
    </div>
  )
}

// ── Draft mode ────────────────────────────────────────────────────────────────

function DraftEndScreenEditor({
  videoUrl,
  thumbnailUrl,
  onClose,
  onDraftChange,
  initialElements,
}: {
  videoUrl?: string | null
  thumbnailUrl?: string | null
  onClose: () => void
  onDraftChange?: (elements: EndScreenElement[]) => void
  initialElements?: EndScreenElement[]
}) {
  const previewRef = useRef<HTMLVideoElement>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const {
    elements,
    addElement,
    deleteElement,
    patchElement,
    commit,
    undo,
    redo,
    canUndo,
    canRedo,
    applyTemplate,
  } = useEndScreen(initialElements)

  const seek = useCallback(
    (t: number) => {
      setCurrentTime(t)
      if (previewRef.current) {
        previewRef.current.currentTime = t
        previewRef.current.pause()
      }
    },
    []
  )

  const handleSaveAll = useCallback(() => {
    onDraftChange?.(elements)
    onClose()
  }, [elements, onDraftChange, onClose])

  const handleDiscard = useCallback(() => {
    onDraftChange?.(initialElements ?? [])
    onClose()
  }, [initialElements, onDraftChange, onClose])

  const handleAdd = useCallback(
    (type: EndScreenElementType) => {
      const id = addElement(type, duration)
      if (id) setSelectedId(id)
    },
    [addElement, duration]
  )

  const handleDelete = useCallback(
    (id: string) => {
      deleteElement(id)
      setSelectedId((prev) => (prev === id ? null : prev))
    },
    [deleteElement]
  )

  const handleApplyTemplate = useCallback(
    (tpl: TemplateElement[]) => {
      applyTemplate(tpl, duration)
      setSelectedId(null)
    },
    [applyTemplate, duration]
  )

  return (
    <EditorShell
      onClose={handleDiscard}
      onSave={handleSaveAll}
      panelSlot={
        <EndScreenPanel
          elements={elements}
          selectedId={selectedId}
          duration={duration}
          onSelect={setSelectedId}
          onAdd={handleAdd}
          onDelete={handleDelete}
          onPatch={patchElement}
          onCommit={commit}
          onApplyTemplate={handleApplyTemplate}
        />
      }
      previewSlot={
        <EndScreenPreview
          ref={previewRef}
          videoUrl={videoUrl}
          thumbnailUrl={thumbnailUrl}
          currentTime={currentTime}
          duration={duration}
          elements={elements}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onPatchElement={patchElement}
          onCommitElement={commit}
          onTimeUpdate={setCurrentTime}
          onDurationChange={setDuration}
        />
      }
      timelineSlot={
        <EndScreenTimeline
          elements={elements}
          currentTime={currentTime}
          duration={duration}
          thumbnailUrl={thumbnailUrl}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onSeek={seek}
          onUndo={undo}
          onRedo={redo}
          canUndo={canUndo}
          canRedo={canRedo}
        />
      }
    />
  )
}

// ── Public component ──────────────────────────────────────────────────────────

export function EndScreenEditor({
  open,
  onClose,
  postId,
  videoUrl,
  thumbnailUrl,
  onDraftChange,
  initialElements,
}: EndScreenEditorProps) {
  if (!open) return null
  return (
    <DraftEndScreenEditor
      videoUrl={videoUrl}
      thumbnailUrl={thumbnailUrl}
      onClose={onClose}
      onDraftChange={onDraftChange}
      initialElements={initialElements}
    />
  )
}
