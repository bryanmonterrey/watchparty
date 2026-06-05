'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Square, Trash, ArrowUp } from 'lucide-react';
import { WaveIcon, PlayIcon, PauseIcon } from '@/components/icons';
import { LiveWaveform } from '@/components/ui/live-waveform';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface AudioRecorderProps {
    onSend: (audioBlob: Blob) => void;
    onStateChange?: (isActive: boolean) => void;
    disabled?: boolean;
}

export function AudioRecorder({ onSend, onStateChange, disabled }: AudioRecorderProps) {
    const [isRecording, setIsRecording] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
    const [recordingTime, setRecordingTime] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false); // Playback state
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<any>(null);
    const streamRef = useRef<MediaStream | null>(null);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
            if (mediaRecorderRef.current) {
                if (mediaRecorderRef.current.state === 'recording') {
                    mediaRecorderRef.current.stop();
                }
            }
            // Robust cleanup of the stream
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
        };
    }, []);

    const handleStreamReady = useCallback((stream: MediaStream) => {
        try {
            streamRef.current = stream; // Capture stream reference for robust cleanup
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            chunksRef.current = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    chunksRef.current.push(e.data);
                }
            };

            mediaRecorder.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
                setAudioBlob(blob);
                setIsProcessing(false);
                // Ensure stream is stopped in our ref as well
                if (streamRef.current) {
                    streamRef.current.getTracks().forEach(track => track.stop());
                    streamRef.current = null;
                }
            };

            mediaRecorder.start();
            setRecordingTime(0);

            // Start timer
            if (timerRef.current) clearInterval(timerRef.current);
            timerRef.current = setInterval(() => {
                setRecordingTime(prev => prev + 1);
            }, 1000);

        } catch (error) {
            console.error('Error initializing MediaRecorder:', error);
            toast.error('Error', {
                description: 'Could not record audio.',
            });
            setIsRecording(false);
            onStateChange?.(false);
        }
    }, [onStateChange]);

    const handleStreamError = useCallback((error: Error) => {
        console.error('Microphone access error (LiveWaveform):', error);
        toast.error('Permission Denied', {
            description: 'Could not access microphone. Please check permissions.',
        });
        setIsRecording(false);
        onStateChange?.(false);
    }, [onStateChange]);

    const startRecording = () => {
        setIsRecording(true);
        onStateChange?.(true);
    };

    const stopRecording = () => {
        console.log('Stopping recording manually');
        setIsProcessing(true);
        setIsRecording(false); // LiveWaveform will stop the stream
        // Do NOT call onStateChange(false) here - we are moving to Review state

        if (mediaRecorderRef.current) {
            if (mediaRecorderRef.current.state === 'recording') {
                mediaRecorderRef.current.stop();
            }
        }

        // Paranoid cleanup: Stop tracks immediately specifically on our ref
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            // Don't nullify yet, let onstop handle it final clear or allow re-use? 
            // Actually better to keep it valid until onstop fires? 
            // No, stopping tracks is safe.
        }

        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
    };

    const playRecording = () => {
        if (!audioBlob) return;

        if (!audioRef.current) {
            const url = URL.createObjectURL(audioBlob);
            audioRef.current = new Audio(url);
            audioRef.current.onended = () => setIsPlaying(false);
        }

        audioRef.current.play();
        setIsPlaying(true);
    };

    const pauseRecording = () => {
        if (audioRef.current) {
            audioRef.current.pause();
            setIsPlaying(false);
        }
    };

    const deleteRecording = () => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
        }
        setIsPlaying(false);
        setAudioBlob(null);
        setRecordingTime(0);
        setIsRecording(false);
        setIsProcessing(false);
        // Ensure state is reset
        onStateChange?.(false);
    };

    const sendRecording = () => {
        if (audioBlob) {
            onSend(audioBlob);
            deleteRecording();
        }
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const audioUrl = useMemo(() => {
        if (!audioBlob) return '';
        return URL.createObjectURL(audioBlob);
    }, [audioBlob]);

    if (audioBlob || isProcessing) {
        return (
            <div className="flex items-center gap-2 w-full animate-in fade-in slide-in-from-bottom-2 duration-200">
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                        e.stopPropagation();
                        deleteRecording();
                    }}
                    disabled={isProcessing}
                    className="h-8 w-8 text-zinc-400 hover:text-red-400 hover:bg-red-400/10 transition-colors shrink-0"
                >
                    <Trash className="h-4 w-4" />
                </Button>

                <div className="flex-1 min-w-0 flex items-center justify-center gap-3">
                    {isProcessing ? (
                        <span className="text-xs text-zinc-400 font-medium animate-pulse">Processing audio...</span>
                    ) : (
                        <>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    isPlaying ? pauseRecording() : playRecording();
                                }}
                                className="h-8 w-8 rounded-full bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shrink-0"
                            >
                                {isPlaying ? <PauseIcon className="size-4 fill-current" /> : <PlayIcon className="size-4 fill-current" />}
                            </Button>
                            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300 tabular-nums">
                                {formatTime(recordingTime)}
                            </span>
                        </>
                    )}
                </div>

                <Button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        sendRecording();
                    }}
                    disabled={isProcessing}
                    className="h-10 w-10 flex-shrink-0 rounded-full p-0 bg-white/90 hover:bg-white text-zinc-900 transition-all hover:scale-105 active:scale-95 shadow-sm disabled:opacity-50"
                >
                    <ArrowUp className="size-5" />
                </Button>
            </div>
        );
    }

    if (isRecording) {
        return (
            <div className="flex items-center gap-3 w-full animate-in fade-in slide-in-from-bottom-2 duration-200 min-h-[60px]">
                <div className="relative flex h-8 w-full mr-2 items-center">
                    <LiveWaveform
                        active={isRecording}
                        barWidth={5}
                        barGap={1}
                        barColor="#3b82f6" // Blue-500
                        height={32}
                        onStreamReady={handleStreamReady}
                        onError={handleStreamError}
                        className="w-full"
                    />
                </div>

                <div className="text-sm text-blue-200 tabular-nums min-w-[40px] text-center font-medium">
                    {formatTime(recordingTime)}
                </div>

                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                        e.stopPropagation();
                        stopRecording();
                    }}
                    className="h-8 w-8 text-zinc-400 hover:text-red-300 hover:bg-zinc-700/50 rounded-full flex-shrink-0 transition-colors"
                >
                    <Square className="h-4 w-4 fill-current" />
                </Button>
            </div>
        );
    }

    return (
        <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
                "h-10 w-10 text-zinc-400 hover:text-zinc-100 dark:hover:bg-zinc-800 transition-colors",
                disabled && "opacity-50 cursor-not-allowed"
            )}
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                startRecording();
            }}
            disabled={disabled}
            title="Record voice message"
        >
            <WaveIcon className="size-5" width={20} height={20} />
        </Button>
    );
}
