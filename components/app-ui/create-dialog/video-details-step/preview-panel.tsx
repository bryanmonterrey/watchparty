"use client"

import * as React from "react"
import { Copy } from "lucide-react"
import { Label } from "@/components/ui/label"

interface PreviewPanelProps {
    file: File
    videoUrl: string
    previewVideoRef: React.RefObject<HTMLVideoElement | null>
    onLoadedMetadata: (e: React.SyntheticEvent<HTMLVideoElement>) => void
    onSeeked: (e: React.SyntheticEvent<HTMLVideoElement>) => void
    previewLink: string
    copyLink: () => void
}

export function PreviewPanel({
    file,
    videoUrl,
    previewVideoRef,
    onLoadedMetadata,
    onSeeked,
    previewLink,
    copyLink,
}: PreviewPanelProps) {
    return (
        <div className="hidden lg:flex w-[300px] bg-zinc-900 rounded-xl p-4 flex-col gap-6">
            <div className="aspect-video bg-black rounded-lg overflow-hidden relative group">
                {file.type.startsWith('video/') ? (
                    <video
                        ref={previewVideoRef}
                        src={videoUrl}
                        className="w-full h-full object-cover"
                        controls
                        onLoadedMetadata={onLoadedMetadata}
                        onSeeked={onSeeked}
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center bg-zinc-800 text-zinc-500">
                        No Preview
                    </div>
                )}
            </div>

            <div className="space-y-4">
                <div className="space-y-1">
                    <Label className="text-xs text-zinc-500">Video link</Label>
                    <div className="flex items-center gap-2">
                        <a href="#" className="text-twitter2 text-sm truncate hover:underline">{previewLink}</a>
                        <button onClick={copyLink} className="text-zinc-500 hover:text-white">
                            <Copy className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                <div className="space-y-1">
                    <Label className="text-xs text-zinc-500">Filename</Label>
                    <p className="text-sm text-zinc-300 truncate" title={file.name}>{file.name}</p>
                </div>
            </div>
        </div>
    )
}
