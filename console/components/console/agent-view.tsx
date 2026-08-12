"use client";

import * as React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  SparklesIcon,
  SentIcon,
  PlusSignIcon,
  Delete02Icon,
  Tick02Icon,
  Loading03Icon,
  Alert02Icon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/console/copy-button";
import { AgentMarkdown } from "@/components/console/agent-markdown";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

// The console Agent — X-developer-portal shape: chat column with a centered
// empty state and a bottom composer, plus a right rail of past conversations
// ("+ New conversation"). Talks NDJSON to /api/console-agent on the main
// worker (same-origin via the /api zone route) — one JSON object per line:
// {t:"delta"|"tool"|"toolResult"|"toolError"|"done"|"error", ...}. No AI-SDK
// client deps, deliberately.
//
// The agent ACTS: it can create apps and API keys, configure the webhook,
// add streaming rules, and enable OAuth sign-in — each through the same tRPC
// procedures the console pages call. Secrets arrive once in the live
// toolResult event and render with a copy button; reloaded threads show a
// redacted placeholder (the server never stores them).

type ToolActivity = {
  name: string;
  running?: boolean;
  output?: unknown;
  error?: string;
};

type Msg = {
  role: "user" | "assistant";
  content: string;
  tools?: ToolActivity[];
};

const TOOL_LABELS: Record<string, string> = {
  getMyConsoleState: "Read your setup",
  listMyApps: "Listed your apps",
  createApp: "Created an app",
  createApiKey: "Created an API key",
  setupWebhook: "Created your webhook endpoint",
  setWebhookEvents: "Updated webhook events",
  addStreamingRules: "Added streaming rules",
  enableSignInWithWatchparty: "Enabled Sign in with watchparty",
};

const SUGGESTIONS = [
  "Create an API key for testing",
  "Set up a webhook for coin.launched",
  "Create an app and enable Sign in with watchparty",
  "What do I have set up so far?",
];

/** View-once credentials in a live tool result — rendered with a copy button. */
function secretRows(output: unknown): { label: string; value: string }[] {
  if (!output || typeof output !== "object") return [];
  const rows: { label: string; value: string }[] = [];
  const o = output as Record<string, unknown>;
  const names: [string, string][] = [
    ["key", "API key"],
    ["secret", "Signing secret"],
    ["clientSecret", "Client secret"],
  ];
  for (const [field, label] of names) {
    const v = o[field];
    if (typeof v === "string" && v.length > 8 && !v.includes("not stored")) {
      rows.push({ label, value: v });
    }
  }
  return rows;
}

function ToolChip({ tool }: { tool: ToolActivity }) {
  const label = TOOL_LABELS[tool.name] ?? tool.name;
  const secrets = tool.output ? secretRows(tool.output) : [];
  return (
    <div className="rounded-xl border bg-card/60 px-3 py-2">
      <div className="flex items-center gap-2 text-xs">
        {tool.running ? (
          <HugeiconsIcon icon={Loading03Icon} className="size-3.5 animate-spin text-muted-foreground" />
        ) : tool.error ? (
          <HugeiconsIcon icon={Alert02Icon} className="size-3.5 text-destructive" />
        ) : (
          <HugeiconsIcon icon={Tick02Icon} className="size-3.5 text-muted-foreground" />
        )}
        <span className={cn("font-medium", tool.error && "text-destructive")}>
          {tool.error ? `${label} — failed` : label}
        </span>
      </div>
      {tool.error ? (
        <p className="mt-1 text-xs text-muted-foreground">{tool.error}</p>
      ) : null}
      {secrets.map((s) => (
        <div key={s.label} className="mt-2 flex items-center gap-2 rounded-lg border bg-background px-2.5 py-1.5">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
              {s.label} — shown once, save it now
            </p>
            <p className="truncate font-mono text-xs">{s.value}</p>
          </div>
          <CopyButton value={s.value} />
        </div>
      ))}
    </div>
  );
}

export function AgentView() {
  const [threadId, setThreadId] = React.useState(() => crypto.randomUUID());
  const [messages, setMessages] = React.useState<Msg[]>([]);
  const [input, setInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const utils = trpc.useUtils();
  const threads = trpc.assistant.threads.useQuery({ surface: "console" });
  const deleteThread = trpc.assistant.deleteThread.useMutation({
    onSuccess: () => void utils.assistant.threads.invalidate(),
  });

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const newConversation = () => {
    if (busy) return;
    setThreadId(crypto.randomUUID());
    setMessages([]);
    setError(null);
  };

  const openThread = async (id: string) => {
    if (busy) return;
    setError(null);
    try {
      const thread = await utils.assistant.thread.fetch({ id });
      const restored: Msg[] = thread.messages.map((m) => {
        const parts = (m.parts ?? []) as { type: string; text?: string; data?: ToolActivity }[];
        const text = parts.filter((p) => p.type === "text").map((p) => p.text ?? "").join("");
        const tools = parts
          .filter((p) => p.type === "data-toolActivity" && p.data)
          .map((p) => p.data as ToolActivity);
        return {
          role: m.role === "user" ? "user" : "assistant",
          content: text,
          ...(tools.length ? { tools } : {}),
        };
      });
      setThreadId(id);
      setMessages(restored);
    } catch {
      setError("couldn't load that conversation");
    }
  };

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setError(null);
    setInput("");
    const history = [...messages, { role: "user" as const, content: q }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setBusy(true);

    const patchLast = (fn: (m: Msg) => Msg) =>
      setMessages((prev) => {
        const copy = prev.slice();
        copy[copy.length - 1] = fn(copy[copy.length - 1]);
        return copy;
      });

    try {
      const res = await fetch("/api/console-agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          threadId,
          // The route replays history for persistence + model context; tool
          // chatter stays client-side — text is what the model needs back.
          messages: history.map((m) => ({ role: m.role, content: m.content })).filter((m) => m.content),
        }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? `request failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let sawText = false;
      let sawDone = false;

      const handle = (line: string) => {
        if (!line.trim()) return;
        let evt: { t: string; v?: unknown; name?: string; threadId?: string };
        try {
          evt = JSON.parse(line);
        } catch {
          return;
        }
        if (evt.t === "delta" && typeof evt.v === "string") {
          sawText = true;
          patchLast((m) => ({ ...m, content: m.content + evt.v }));
        } else if (evt.t === "tool" && evt.name) {
          patchLast((m) => ({ ...m, tools: [...(m.tools ?? []), { name: evt.name!, running: true }] }));
        } else if ((evt.t === "toolResult" || evt.t === "toolError") && evt.name) {
          patchLast((m) => {
            const tools = (m.tools ?? []).slice();
            // Finish the most recent still-running entry for this tool.
            for (let i = tools.length - 1; i >= 0; i--) {
              if (tools[i].name === evt.name && tools[i].running) {
                tools[i] = evt.t === "toolResult"
                  ? { name: evt.name!, output: evt.v }
                  : { name: evt.name!, error: String(evt.v) };
                return { ...m, tools };
              }
            }
            return { ...m, tools: [...tools, evt.t === "toolResult" ? { name: evt.name!, output: evt.v } : { name: evt.name!, error: String(evt.v) }] };
          });
        } else if (evt.t === "done") {
          sawDone = true;
          void utils.assistant.threads.invalidate();
        } else if (evt.t === "error") {
          setError(typeof evt.v === "string" ? evt.v : "something went wrong");
        }
      };

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) handle(line);
      }
      if (buffer) handle(buffer);

      if (!sawText && !sawDone) throw new Error("the agent returned an empty reply");
    } catch (e) {
      setError(e instanceof Error ? e.message : "something went wrong");
      // Drop the empty assistant bubble on failure.
      setMessages((prev) =>
        prev.filter((m, i) => !(i === prev.length - 1 && m.role === "assistant" && !m.content && !m.tools?.length)),
      );
    } finally {
      setBusy(false);
    }
  };

  const empty = messages.length === 0;

  return (
    <div className="flex h-full min-h-0">
      {/* Chat column */}
      <div className="flex min-w-0 flex-1 flex-col p-4 sm:p-6">
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {empty ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 py-10 text-center">
              <div className="flex size-10 items-center justify-center rounded-lg border">
                <HugeiconsIcon icon={SparklesIcon} className="size-4.5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-semibold">Console Agent</p>
                <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">
                  Set up apps, configure webhooks, manage subscriptions, and
                  more — just describe what you want to build.
                </p>
              </div>
              <div className="flex max-w-md flex-wrap justify-center gap-2">
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
            <div className="mx-auto flex max-w-3xl flex-col gap-4 pb-2">
              {messages.map((m, i) => (
                <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                  <div className="flex max-w-[85%] flex-col gap-2">
                    {m.tools?.map((tool, j) => <ToolChip key={j} tool={tool} />)}
                    {m.content || (!m.tools?.length && busy && i === messages.length - 1) ? (
                      <div
                        className={cn(
                          "rounded-2xl px-3.5 py-2 text-sm",
                          m.role === "user"
                            ? "bg-foreground text-background whitespace-pre-wrap"
                            : "bg-muted/50",
                        )}
                      >
                        {m.role === "assistant" && m.content ? (
                          <AgentMarkdown>{m.content}</AgentMarkdown>
                        ) : (
                          m.content || "…"
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}

        <form
          className="mx-auto mt-3 flex w-full max-w-3xl items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask me to set up apps, webhooks, subscriptions…"
            disabled={busy}
            className="h-11 flex-1 rounded-xl border bg-transparent px-3.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          />
          <Button type="submit" size="icon" disabled={busy || !input.trim()} aria-label="Send">
            <HugeiconsIcon icon={SentIcon} className="size-4" />
          </Button>
        </form>
      </div>

      {/* Conversation rail */}
      <aside className="hidden w-64 shrink-0 flex-col gap-1 border-l p-3 lg:flex">
        <Button
          type="button"
          variant="outline"
          className="w-full justify-start gap-2"
          onClick={newConversation}
          disabled={busy}
        >
          <HugeiconsIcon icon={PlusSignIcon} className="size-4" />
          New conversation
        </Button>
        <div className="mt-2 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
          {(threads.data ?? []).map((t) => (
            <div
              key={t.id}
              className={cn(
                "group flex items-center gap-1 rounded-lg",
                t.id === threadId ? "bg-accent" : "hover:bg-accent/60",
              )}
            >
              <button
                type="button"
                onClick={() => void openThread(t.id)}
                className="min-w-0 flex-1 px-2.5 py-2 text-left text-xs"
              >
                <span className="block truncate">{t.title}</span>
              </button>
              <button
                type="button"
                aria-label="Delete conversation"
                onClick={() => {
                  deleteThread.mutate({ id: t.id });
                  if (t.id === threadId) newConversation();
                }}
                className="mr-1 hidden rounded p-1 text-muted-foreground group-hover:block hover:text-destructive"
              >
                <HugeiconsIcon icon={Delete02Icon} className="size-3.5" />
              </button>
            </div>
          ))}
          {threads.data?.length === 0 ? (
            <p className="px-2.5 py-2 text-xs text-muted-foreground">
              Conversations you start appear here.
            </p>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
