"use client";

import { useState, useRef, useCallback } from "react";
import { Square, Play, Pause, Trash2, Check, Loader2 } from "lucide-react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Mic01Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface VoiceRecorderProps {
    onAudioReady: (blob: Blob, durationSeconds: number) => void;
    onCancel: () => void;
}

type RecordState = "idle" | "recording" | "preview";

function formatDuration(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
}

export function VoiceRecorder({ onAudioReady, onCancel }: VoiceRecorderProps) {
    const [state, setState] = useState<RecordState>("idle");
    const [seconds, setSeconds] = useState(0);
    const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<BlobPart[]>([]);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    const startRecording = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
            chunksRef.current = [];
            mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
            mr.onstop = () => {
                stream.getTracks().forEach(t => t.stop());
                const blob = new Blob(chunksRef.current, { type: "audio/webm" });
                const url = URL.createObjectURL(blob);
                setAudioBlob(blob);
                setAudioUrl(url);
                setState("preview");
            };
            mr.start();
            mediaRecorderRef.current = mr;
            setSeconds(0);
            setState("recording");
            timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
        } catch {
            toast.error("Microphone access denied");
        }
    }, []);

    const stopRecording = useCallback(() => {
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        mediaRecorderRef.current?.stop();
    }, []);

    const togglePlayback = useCallback(() => {
        if (!audioUrl) return;
        if (!audioRef.current) {
            audioRef.current = new Audio(audioUrl);
            audioRef.current.onended = () => setIsPlaying(false);
        }
        if (isPlaying) {
            audioRef.current.pause();
            setIsPlaying(false);
        } else {
            audioRef.current.play();
            setIsPlaying(true);
        }
    }, [audioUrl, isPlaying]);

    const handleConfirm = useCallback(() => {
        if (!audioBlob) return;
        if (audioRef.current) { audioRef.current.pause(); }
        onAudioReady(audioBlob, seconds);
    }, [audioBlob, seconds, onAudioReady]);

    const handleDiscard = useCallback(() => {
        if (timerRef.current) clearInterval(timerRef.current);
        mediaRecorderRef.current?.stop();
        if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        setAudioBlob(null);
        setAudioUrl(null);
        setSeconds(0);
        setState("idle");
        onCancel();
    }, [audioUrl, onCancel]);

    return (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-900/60 border border-white/10">
            {state === "idle" && (
                <button
                    onClick={startRecording}
                    className="flex items-center gap-2 text-sm text-zinc-300 hover:text-lantern transition-colors"
                >
                    <HugeiconsIcon icon={Mic01Icon} className="size-4 text-lantern" strokeWidth={2} />
                    <span>Record voice note</span>
                </button>
            )}

            {state === "recording" && (
                <>
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
                    <span className="text-sm text-zinc-300 ">{formatDuration(seconds)}</span>
                    <div className="flex-1 flex items-center gap-0.5 overflow-hidden">
                        {Array.from({ length: 20 }).map((_, i) => (
                            <span
                                key={i}
                                className="flex-1 rounded-full bg-lantern/60 animate-pulse"
                                style={{ height: `${4 + Math.random() * 12}px`, animationDelay: `${i * 50}ms` }}
                            />
                        ))}
                    </div>
                    <button onClick={stopRecording} className="p-1.5 rounded-full bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors">
                        <Square className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={handleDiscard} className="p-1.5 rounded-full text-zinc-500 hover:text-zinc-300 hover:bg-white/10 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                </>
            )}

            {state === "preview" && (
                <>
                    <button onClick={togglePlayback} className="p-1.5 rounded-full bg-lantern/20 text-lantern hover:bg-lantern/30 transition-colors">
                        {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    </button>
                    <span className="text-sm text-zinc-400 ">{formatDuration(seconds)}</span>
                    <div className="flex-1 h-1 rounded-full bg-white/10 overflow-hidden">
                        <div className="h-full bg-lantern/60 rounded-full w-full" />
                    </div>
                    <button onClick={handleConfirm} className="p-1.5 rounded-full bg-lantern text-black hover:bg-lantern/90 transition-colors">
                        <Check className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={handleDiscard} className="p-1.5 rounded-full text-zinc-500 hover:text-zinc-300 hover:bg-white/10 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                </>
            )}
        </div>
    );
}

// ---- Inline trigger button for composer toolbar ----
interface VoiceRecorderTriggerProps {
    active: boolean;
    onClick: () => void;
    /** The host toolbar's resting look (size, colour, hover) — the comment
     *  composer's icons are size-8 / zinc-400, the post composer's p-2 / 22px.
     *  Without it the button had no resting colour and inherited white
     *  (owner, 2026-10-04: "the microphone button is default white"). */
    className?: string;
    iconClassName?: string;
}
export function VoiceRecorderTrigger({ active, onClick, className, iconClassName }: VoiceRecorderTriggerProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "cursor-pointer rounded-full transition-colors",
                className ?? "p-2 hover:bg-white/10",
                active && "bg-white/10 text-white",
            )}
            title="Voice note"
            aria-label="voice note"
            aria-pressed={active}
        >
            <HugeiconsIcon icon={Mic01Icon} className={iconClassName ?? "size-[22px]"} strokeWidth={2} />
        </button>
    );
}
