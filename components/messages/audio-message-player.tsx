'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { PlayIcon, PauseIcon } from '@/components/icons';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface AudioMessagePlayerProps {
    src: string;
    isSent?: boolean;
    className?: string;
}

export function AudioMessagePlayer({ src, isSent, className }: AudioMessagePlayerProps) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
    const animationRef = useRef<number>(0);

    // Canvas configuration (matching LiveWaveform style)
    const barWidth = 2;
    const barGap = 1;
    const barRadius = 1;
    const barColor = isSent ? '#ffffff' : '#3b82f6'; // White for sent (blue bubbles), Blue for received
    const sensitivity = 5; // Higher sensitivity for playback visualization

    useEffect(() => {
        // Initialize Audio Context and Analyser on user interaction or first play
        const initAudioContext = () => {
            if (!audioContextRef.current && audioRef.current) {
                const AudioContextConstructor = window.AudioContext || (window as any).webkitAudioContext;
                const audioContext = new AudioContextConstructor();
                const analyser = audioContext.createAnalyser();
                analyser.fftSize = 256;

                try {
                    const source = audioContext.createMediaElementSource(audioRef.current);
                    source.connect(analyser);
                    analyser.connect(audioContext.destination);

                    audioContextRef.current = audioContext;
                    analyserRef.current = analyser;
                    sourceRef.current = source;
                } catch (e) {
                    console.error("Audio Context Init Error", e);
                }
            }
        };

        if (isPlaying) {
            initAudioContext();
            if (audioContextRef.current?.state === 'suspended') {
                audioContextRef.current.resume();
            }
        }
    }, [isPlaying]);

    // Canvas Drawing Loop
    useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Resize handler
        const resizeObserver = new ResizeObserver(() => {
            const rect = container.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            canvas.style.width = `${rect.width}px`;
            canvas.style.height = `${rect.height}px`;
            ctx.scale(dpr, dpr);
        });
        resizeObserver.observe(container);

        const animate = () => {
            const rect = container.getBoundingClientRect();
            ctx.clearRect(0, 0, rect.width, rect.height);

            let dataArray = new Uint8Array(0);
            if (analyserRef.current) {
                const bufferLength = analyserRef.current.frequencyBinCount;
                dataArray = new Uint8Array(bufferLength);
                analyserRef.current.getByteFrequencyData(dataArray);
            }

            // Fallback visualization if not playing or initial state (randomized idle or flat)
            // Using a simple static wave for idle state would be nice, but flat line is safer for now.
            // Or use the LiveWaveform idle animation logic? Let's stick to flat or minimal noise if idle.

            const step = barWidth + barGap;
            const barCount = Math.floor(rect.width / step);
            const centerY = rect.height / 2;

            // Standardizing frequency data mapping to bars
            const relevantData = dataArray.slice(0, Math.floor(dataArray.length * 0.7)); // Cut off high freq noise

            for (let i = 0; i < barCount; i++) {
                let value = 0.05; // Minimum height
                if (isPlaying && relevantData.length > 0) {
                    // Map bar index to frequency index
                    const dataIndex = Math.floor((i / barCount) * relevantData.length);
                    value = Math.max(0.05, (relevantData[dataIndex] / 255) * sensitivity);
                    value = Math.min(1, value);

                    ctx.globalAlpha = 0.8;
                } else {
                    // Static fake waveform for preview/idle state
                    // Use deterministic math to create a "voice-like" pattern
                    const n = i / barCount;
                    // Combination of sine waves to look natural
                    value = Math.abs(Math.sin(n * 20) * 0.5 + Math.cos(n * 40) * 0.3) * 0.6;
                    value = Math.max(0.1, value); // Ensure visibility

                    ctx.globalAlpha = 0.4;
                }

                const x = i * step;
                const h = Math.max(2, value * rect.height * 0.8);
                const y = centerY - h / 2;

                ctx.fillStyle = barColor;

                ctx.beginPath();
                if (barRadius > 0) {
                    ctx.roundRect(x, y, barWidth, h, barRadius);
                } else {
                    ctx.rect(x, y, barWidth, h);
                }
                ctx.fill();
            }

            animationRef.current = requestAnimationFrame(animate);
        };

        animate();

        return () => {
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
            resizeObserver.disconnect();
        };
    }, [isPlaying, barColor, isSent]);

    const togglePlay = () => {
        if (!audioRef.current) return;
        if (isPlaying) {
            audioRef.current.pause();
        } else {
            audioRef.current.play().catch(e => console.error("Play error", e));
        }
        setIsPlaying(!isPlaying);
    };

    const handleTimeUpdate = () => {
        if (audioRef.current) {
            setCurrentTime(audioRef.current.currentTime);
        }
    };

    const handleLoadedMetadata = () => {
        if (audioRef.current) {
            setDuration(audioRef.current.duration);
        }
    };

    const handleEnded = () => {
        setIsPlaying(false);
        setCurrentTime(0); // Reset to start
        if (audioRef.current) audioRef.current.currentTime = 0;
    };

    const formatTime = (time: number) => {
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    return (
        <div className={cn(
            "flex items-center gap-2 w-full",
            isSent ? "pr-2" : "pl-0",
            className
        )}>
            <audio
                ref={audioRef}
                src={src}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onEnded={handleEnded}
                className="hidden"
                crossOrigin="anonymous"
            />

            <Button
                variant="ghost"
                size="icon"
                onClick={togglePlay}
                className={cn(
                    "h-8 w-8 rounded-full shrink-0 transition-colors",
                    isSent ? "text-white hover:bg-white/20" : "text-zinc-800 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                )}
            >
                {isPlaying ? <PauseIcon className="size-5 fill-current" /> : <PlayIcon className="size-5 fill-current" />}
            </Button>

            <div
                ref={containerRef}
                className="flex-1 h-8 relative select-none cursor-pointer"
                onClick={() => {
                    // Seek functionality could go here (calculate x position -> time)
                }}
            >
                <canvas ref={canvasRef} className="w-full h-full block" />
            </div>

            <span className={cn(
                "text-xs shrink-0 tabular-nums select-none",
                isSent ? "text-blue-100" : "text-zinc-500 dark:text-zinc-400"
            )}>
                {formatTime(currentTime)}
            </span>
        </div>
    );
}
