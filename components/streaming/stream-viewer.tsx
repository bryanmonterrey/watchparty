"use client";

import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { LiveBadge } from "./live-badge";
import { MessageCircle, Users, X, Send } from "lucide-react";
import { cn } from "@/lib/utils";

// IVS Player is loaded dynamically — it's a browser-only UMD script
declare global {
    interface Window {
        IVSPlayer?: {
            isPlayerSupported: boolean;
            create: () => {
                attachHTMLVideoElement: (el: HTMLVideoElement) => void;
                load: (url: string) => void;
                play: () => void;
                pause: () => void;
                delete: () => void;
                addEventListener: (event: string, cb: (...args: unknown[]) => void) => void;
            };
            PlayerEventType: Record<string, string>;
            PlayerState: Record<string, string>;
        };
    }
}

interface ChatMessage {
    id: string;
    sender: string;
    content: string;
    ts: number;
}

function IVSChatClient({
    token,
    chatRoomArn,
    username,
}: {
    token: string;
    chatRoomArn: string;
    username: string;
}) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState("");
    const wsRef = useRef<WebSocket | null>(null);
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // IVS Chat uses a WebSocket endpoint derived from the room ARN region
        const region = chatRoomArn.split(":")[3];
        const ws = new WebSocket(`wss://edge.ivschat.${region}.amazonaws.com`, token);
        wsRef.current = ws;

        ws.onmessage = (e) => {
            try {
                const msg = JSON.parse(e.data);
                if (msg.Type === "MESSAGE") {
                    setMessages(prev => [...prev.slice(-199), {
                        id: msg.Id,
                        sender: msg.Sender?.Attributes?.username ?? "Guest",
                        content: msg.Content,
                        ts: Date.now(),
                    }]);
                }
            } catch { /* ignore parse errors */ }
        };

        return () => ws.close();
    }, [token, chatRoomArn]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const send = () => {
        if (!input.trim() || wsRef.current?.readyState !== WebSocket.OPEN) return;
        wsRef.current.send(JSON.stringify({ Action: "SEND_MESSAGE", Content: input.trim() }));
        setInput("");
    };

    return (
        <div className="flex flex-col h-full">
            <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-hide">
                {messages.length === 0 && (
                    <p className="text-xs text-zinc-600 text-center pt-4">Chat is quiet…</p>
                )}
                {messages.map(m => (
                    <div key={m.id} className="text-sm">
                        <span className="font-semibold text-lantern mr-1">{m.sender}</span>
                        <span className="text-zinc-300">{m.content}</span>
                    </div>
                ))}
                <div ref={bottomRef} />
            </div>
            <div className="border-t border-white/10 p-2 flex gap-2">
                <input
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && send()}
                    placeholder={`Chat as ${username}…`}
                    className="flex-1 bg-zinc-800 text-sm text-zinc-200 px-3 py-1.5 rounded-lg placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-lantern/50"
                />
                <button
                    onClick={send}
                    disabled={!input.trim()}
                    className="p-1.5 rounded-lg bg-lantern text-zinc-950 hover:bg-lantern/90 disabled:opacity-40 transition-colors"
                >
                    <Send className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}

interface StreamViewerProps {
    hostUserId: string;
    hostUsername: string;
    viewerUsername: string;
}

export function StreamViewer({ hostUserId, hostUsername, viewerUsername }: StreamViewerProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const playerRef = useRef<ReturnType<NonNullable<Window["IVSPlayer"]>["create"]> | null>(null);
    const [playerReady, setPlayerReady] = useState(false);
    const [showChat, setShowChat] = useState(true);
    const [chatToken, setChatToken] = useState<{ token: string; chatRoomArn: string } | null>(null);

    const { data: stream } = trpc.stream.getByUserId.useQuery({ userId: hostUserId });
    const getChatToken = trpc.stream.getChatToken.useMutation({
        onSuccess: (data) => setChatToken(data),
    });

    // Load IVS player script
    useEffect(() => {
        if (window.IVSPlayer) { setPlayerReady(true); return; }
        const script = document.createElement("script");
        script.src = "https://player.live-video.net/1.29.0/amazon-ivs-player.min.js";
        script.onload = () => setPlayerReady(true);
        document.head.appendChild(script);
    }, []);

    // Init player when ready + stream available
    useEffect(() => {
        if (!playerReady || !stream?.playbackUrl || !videoRef.current) return;
        if (!window.IVSPlayer?.isPlayerSupported) return;

        const player = window.IVSPlayer.create();
        playerRef.current = player;
        player.attachHTMLVideoElement(videoRef.current);
        player.load(stream.playbackUrl);
        player.play();

        return () => { player.delete(); playerRef.current = null; };
    }, [playerReady, stream?.playbackUrl]);

    // Fetch chat token when stream is live
    useEffect(() => {
        if (stream?.isLive && stream.chatRoomArn) {
            getChatToken.mutate({ hostUserId });
        }
    }, [stream?.isLive, stream?.chatRoomArn]);

    if (!stream) return null;

    if (!stream.isLive) {
        return (
            <div className="rounded-2xl bg-zinc-900/60 border border-white/10 p-12 text-center space-y-3">
                <div className="w-16 h-16 mx-auto rounded-full bg-zinc-800 flex items-center justify-center">
                    <Users className="w-7 h-7 text-zinc-600" />
                </div>
                <p className="text-zinc-300 font-semibold">@{hostUsername} is offline</p>
                {stream.title && <p className="text-sm text-zinc-500">{stream.title}</p>}
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {/* Stream header */}
            <div className="flex items-center gap-3">
                <LiveBadge size="md" />
                {stream.title && <p className="text-sm font-semibold text-zinc-200">{stream.title}</p>}
                {stream.category && <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">{stream.category}</span>}
                <span className="ml-auto flex items-center gap-1 text-xs text-zinc-500">
                    <Users className="w-3 h-3" />{stream.viewerCount ?? 0}
                </span>
            </div>

            {/* Player + chat layout */}
            <div className="flex gap-3 items-start">
                {/* Video */}
                <div className={cn("relative rounded-2xl overflow-hidden bg-black", showChat ? "flex-1" : "w-full")}>
                    <video
                        ref={videoRef}
                        className="w-full aspect-video"
                        playsInline
                        controls
                        autoPlay
                    />
                    <button
                        onClick={() => setShowChat(v => !v)}
                        className="absolute top-3 right-3 p-1.5 rounded-lg bg-black/60 hover:bg-black/80 text-white transition-colors"
                        title={showChat ? "Hide chat" : "Show chat"}
                    >
                        {showChat ? <X className="w-4 h-4" /> : <MessageCircle className="w-4 h-4" />}
                    </button>
                </div>

                {/* Chat */}
                {showChat && chatToken && (
                    <div className="w-72 shrink-0 h-[480px] rounded-2xl bg-zinc-900/80 border border-white/10 flex flex-col overflow-hidden">
                        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/10">
                            <MessageCircle className="w-4 h-4 text-zinc-400" />
                            <span className="text-sm font-semibold text-zinc-200">Live Chat</span>
                        </div>
                        <IVSChatClient
                            token={chatToken.token}
                            chatRoomArn={chatToken.chatRoomArn}
                            username={viewerUsername}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
