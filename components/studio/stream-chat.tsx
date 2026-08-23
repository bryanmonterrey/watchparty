"use client";

import * as React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { SentIcon } from "@hugeicons/core-free-icons";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";

// The broadcaster's own chat in the cockpit — a lean adaptation of the viewer
// IVSChatClient (stream-viewer.tsx). getChatToken mints a SEND_MESSAGE token
// for the caller's own room; we connect the IVS chat WebSocket directly.
// NOTE: WebSocket flow can only be confirmed against a live broadcast — tsc
// verifies the code, not that messages actually arrive.

type Msg = { id: string; sender: string; content: string };

export function StreamChat({
  hostUserId,
  hasChatRoom,
  // A slot, not a boolean: the rail puts pop-out and hide controls here, and
  // the pop-out window puts nothing, without this file knowing either exists.
  action,
}: {
  hostUserId: string;
  hasChatRoom: boolean;
  action?: React.ReactNode;
}) {
  const [creds, setCreds] = React.useState<{ token: string; chatRoomArn: string } | null>(null);
  const [messages, setMessages] = React.useState<Msg[]>([]);
  const [input, setInput] = React.useState("");
  const wsRef = React.useRef<WebSocket | null>(null);
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const getToken = trpc.stream.getChatToken.useMutation();

  // Mint a token once the room is provisioned.
  React.useEffect(() => {
    if (!hasChatRoom || creds) return;
    getToken.mutate(
      { hostUserId },
      { onSuccess: (d) => setCreds({ token: d.token, chatRoomArn: d.chatRoomArn }) },
    );
    // getToken is stable for this purpose; re-running on its identity would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasChatRoom, hostUserId, creds]);

  React.useEffect(() => {
    if (!creds) return;
    const region = creds.chatRoomArn.split(":")[3];
    const ws = new WebSocket(`wss://edge.ivschat.${region}.amazonaws.com`, creds.token);
    wsRef.current = ws;
    ws.onmessage = (e) => {
      try {
        const m = JSON.parse(e.data as string);
        if (m.Type === "MESSAGE") {
          setMessages((prev) => [
            ...prev.slice(-199),
            { id: m.Id, sender: m.Sender?.Attributes?.username ?? "Guest", content: m.Content },
          ]);
        }
      } catch {
        /* ignore malformed frames */
      }
    };
    return () => ws.close();
  }, [creds]);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = () => {
    if (!input.trim() || wsRef.current?.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ Action: "SEND_MESSAGE", Content: input.trim() }));
    setInput("");
  };

  return (
    <div className="flex h-[420px] flex-col rounded-2xl border border-border/60 bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-2.5">
        <p className="text-sm font-medium">Chat</p>
        {action}
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {!hasChatRoom ? (
          <p className="pt-4 text-center text-xs text-muted-foreground">
            Generate your stream key to enable chat.
          </p>
        ) : messages.length === 0 ? (
          <p className="pt-4 text-center text-xs text-muted-foreground">Chat is quiet…</p>
        ) : (
          messages.map((m) => (
            <p key={m.id} className="py-0.5 text-sm leading-snug">
              <span className="mr-1 font-semibold text-foreground">{m.sender}</span>
              <span className="text-muted-foreground">{m.content}</span>
            </p>
          ))
        )}
        <div ref={bottomRef} />
      </div>
      <div className="flex items-center gap-2 border-t border-border/60 p-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Send a message"
          disabled={!creds}
          className="h-9 flex-1 rounded-lg border border-border/60 bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        />
        <Button size="icon-sm" onClick={send} disabled={!input.trim() || !creds} aria-label="Send">
          <HugeiconsIcon icon={SentIcon} className="size-4" />
        </Button>
      </div>
    </div>
  );
}
