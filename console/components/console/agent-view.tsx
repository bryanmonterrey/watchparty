"use client";

import * as React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { SparklesIcon, SentIcon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";

// The console Agent chat. Streams plain text from /api/console-agent (the main
// worker, same-origin) and appends it — no AI-SDK client deps. The agent reads
// your setup and guides you; it doesn't take actions (create keys/webhooks
// stay on their pages behind your own click).

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "What do I have set up so far?",
  "How do I start calling the API?",
  "How do webhooks work here?",
  "What are key scopes?",
];

export function AgentView() {
  const [messages, setMessages] = React.useState<Msg[]>([]);
  const [input, setInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setError(null);
    setInput("");
    const next: Msg[] = [...messages, { role: "user", content: q }];
    setMessages([...next, { role: "assistant", content: "" }]);
    setBusy(true);
    try {
      const res = await fetch("/api/console-agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? `request failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const copy = prev.slice();
          copy[copy.length - 1] = { role: "assistant", content: acc };
          return copy;
        });
      }
      if (!acc.trim()) throw new Error("the agent returned an empty reply");
    } catch (e) {
      setError(e instanceof Error ? e.message : "something went wrong");
      // Drop the empty assistant bubble on failure.
      setMessages((prev) => prev.filter((m, i) => !(i === prev.length - 1 && m.role === "assistant" && !m.content)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col p-4 sm:p-6">
      <div className="mb-4">
        <h2 className="text-xl font-semibold">Agent</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Ask about the API and your setup — the agent reads your state and
          guides you. It won&apos;t make changes for you.
        </p>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto rounded-xl border bg-card p-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 py-10 text-center">
            <div className="flex size-10 items-center justify-center rounded-lg border">
              <HugeiconsIcon icon={SparklesIcon} className="size-4.5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">Console Agent</p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void send(s)}
                  className="rounded-full border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap ${
                    m.role === "user" ? "bg-foreground text-background" : "bg-muted/50"
                  }`}
                >
                  {m.content || (busy ? "…" : "")}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}

      <form
        className="mt-3 flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask the agent…"
          disabled={busy}
          className="h-11 flex-1 rounded-xl border bg-transparent px-3.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        />
        <Button type="submit" size="icon" disabled={busy || !input.trim()} aria-label="Send">
          <HugeiconsIcon icon={SentIcon} className="size-4" />
        </Button>
      </form>
    </div>
  );
}
