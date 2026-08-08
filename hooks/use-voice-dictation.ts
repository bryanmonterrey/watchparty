"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Live dictation for the assistant composer: mic → Deepgram nova-3 over a
// WebSocket the BROWSER owns, transcript streaming back word by word.
//
// Streaming, not batch. Whisper (`@cf/openai/whisper*`) would have been one
// HTTP POST and no socket, but it only transcribes a finished recording — you
// speak, then wait. Deepgram's live endpoint returns interim results while
// you're still talking, which is the difference between dictation that feels
// like typing and dictation that feels like uploading.
//
// The socket goes browser → Deepgram directly, authorised by a 60s token from
// /api/assistant/voice-token (see that file for why this doesn't need a
// Durable Object). Audio never touches our servers.

const MODEL = "nova-3";

// MediaRecorder's own container, sent as-is. Deepgram sniffs the container when
// `encoding` is omitted, so there's no PCM conversion here — no AudioWorklet, no
// resampling, no `onnxruntime` WASM shipped to the client. Opus is also ~10x
// smaller on the wire than linear16, which matters on mobile data.
const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"] as const;

// How often MediaRecorder hands us a chunk. 250ms is the interval Deepgram's own
// examples use: short enough that interim results feel live, long enough that
// each blob is a decodable fragment rather than socket chatter.
const TIMESLICE_MS = 250;

function pickMimeType(): string | undefined {
    if (typeof MediaRecorder === "undefined") return undefined;
    return MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t));
}

export type VoiceState = "idle" | "starting" | "listening" | "error";

export function useVoiceDictation({
    onFinalText,
    onQuotaExhausted,
}: {
    /** Called with each settled phrase, to append into the composer. */
    onFinalText: (text: string) => void;
    /** 402 from the token route — same upgrade path as a typed message. */
    onQuotaExhausted?: () => void;
}) {
    const [state, setState] = useState<VoiceState>("idle");
    const [interim, setInterim] = useState("");
    const [error, setError] = useState<string | null>(null);

    const socket = useRef<WebSocket | null>(null);
    const recorder = useRef<MediaRecorder | null>(null);
    const stream = useRef<MediaStream | null>(null);

    // Read inside socket callbacks, which are created once and would otherwise
    // capture the first render's closure and append into a stale composer.
    // Assigned in an effect, not during render: a render can be discarded under
    // concurrent rendering, and writing the ref inline would publish a callback
    // from a render that never committed.
    const onFinal = useRef(onFinalText);
    useEffect(() => {
        onFinal.current = onFinalText;
    }, [onFinalText]);

    const teardown = useCallback(() => {
        // Order matters: stop producing audio, tell Deepgram we're done so it
        // flushes whatever it's holding, THEN drop the socket.
        const rec = recorder.current;
        if (rec && rec.state !== "inactive") rec.stop();
        recorder.current = null;

        const ws = socket.current;
        if (ws && ws.readyState === WebSocket.OPEN) {
            // CloseStream, not close(): it makes Deepgram emit the final
            // transcript for audio already sent. Closing the socket outright
            // drops the tail of the last sentence.
            try {
                ws.send(JSON.stringify({ type: "CloseStream" }));
            } catch {
                // Socket died between the readyState check and here.
            }
        }
        // Deepgram closes its side after CloseStream; this is the backstop for
        // when it doesn't.
        setTimeout(() => {
            socket.current?.close();
            socket.current = null;
        }, 1200);

        // The mic indicator stays lit until every track is stopped — releasing
        // the stream is what actually turns it off, not closing the socket.
        stream.current?.getTracks().forEach((t) => t.stop());
        stream.current = null;

        setInterim("");
    }, []);

    const stop = useCallback(() => {
        teardown();
        setState("idle");
    }, [teardown]);

    const start = useCallback(async () => {
        if (state === "listening" || state === "starting") return;
        setError(null);
        setState("starting");

        try {
            const res = await fetch("/api/assistant/voice-token", { method: "POST" });
            if (res.status === 402) {
                onQuotaExhausted?.();
                setState("idle");
                return;
            }
            if (!res.ok) throw new Error("couldn't start voice");
            const { token } = (await res.json()) as { token: string };

            // Prompt for the mic AFTER the token succeeds, so a user who is out
            // of quota never sees a permission dialog for something that was
            // going to be refused anyway.
            //
            // The three constraints are not optional. Without echoCancellation
            // the assistant's own spoken replies feed back into the mic and get
            // transcribed as if the user said them.
            const mic = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            });
            stream.current = mic;

            const params = new URLSearchParams({
                model: MODEL,
                interim_results: "true",
                smart_format: "true",
                // Domain vocabulary. Without these nova-3 reliably writes
                // "watch party", "Salana" and "mem scope".
                keyterm: "watchparty",
            });
            for (const term of ["Solana", "memescope", "USDC", "SOL"]) {
                params.append("keyterm", term);
            }

            // ['bearer', token] — a browser WebSocket cannot set headers, and
            // this subprotocol form is the reason no server proxy is needed.
            const ws = new WebSocket(
                `wss://api.deepgram.com/v1/listen?${params}`,
                ["bearer", token],
            );
            socket.current = ws;

            ws.onopen = () => {
                const mimeType = pickMimeType();
                const rec = new MediaRecorder(mic, mimeType ? { mimeType } : undefined);
                recorder.current = rec;
                rec.ondataavailable = (e) => {
                    // readyState guard: MediaRecorder keeps firing for a beat
                    // after the socket closes, and send() on a CLOSING socket
                    // throws.
                    if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) ws.send(e.data);
                };
                rec.start(TIMESLICE_MS);
                setState("listening");
            };

            ws.onmessage = (event) => {
                let msg: {
                    type?: string;
                    is_final?: boolean;
                    channel?: { alternatives?: { transcript?: string }[] };
                };
                try {
                    msg = JSON.parse(event.data as string);
                } catch {
                    return;
                }
                if (msg.type !== "Results") return;

                const text = msg.channel?.alternatives?.[0]?.transcript?.trim();
                if (!text) return;

                // Interim results are revisions of the same phrase, not new
                // words — they replace, they don't accumulate. Only `is_final`
                // is settled enough to commit to the composer.
                if (msg.is_final) {
                    onFinal.current(text);
                    setInterim("");
                } else {
                    setInterim(text);
                }
            };

            ws.onerror = () => {
                setError("Voice connection failed");
                setState("error");
                teardown();
            };

            ws.onclose = (ev) => {
                // Kept deliberately: a silent socket is this feature's failure
                // mode, and the close code is the only thing that distinguishes
                // "Deepgram rejected us" from "no speech was detected".
                if (ev.code !== 1000) {
                    console.warn("[voice] socket closed", ev.code, ev.reason);
                }
                // Only a surprise close matters. A close we asked for has
                // already moved state to idle.
                setState((s) => (s === "listening" || s === "starting" ? "idle" : s));
            };
        } catch (e) {
            const denied = e instanceof DOMException && e.name === "NotAllowedError";
            setError(denied ? "Microphone access was blocked" : "Couldn't start voice");
            setState("error");
            teardown();
        }
    }, [state, onQuotaExhausted, teardown]);

    // Unmounting mid-session (closing the panel, navigating away) must not
    // leave the mic recording — the browser's recording indicator would stay
    // lit with nothing on screen to explain it.
    useEffect(() => teardown, [teardown]);

    return {
        state,
        interim,
        error,
        listening: state === "listening",
        start,
        stop,
        toggle: () => (state === "listening" || state === "starting" ? stop() : start()),
    };
}
