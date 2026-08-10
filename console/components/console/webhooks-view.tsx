"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HugeiconsIcon } from "@hugeicons/react";
import { WebhookIcon, Tick02Icon, UnfoldMoreIcon } from "@hugeicons/core-free-icons";
import { trpc } from "@/lib/trpc";
import { formatDateTime } from "@/lib/format";
import { Chip } from "@/components/console/chip";
import { CopyButton } from "@/components/console/copy-button";
import {
  WEBHOOK_EVENTS,
  SAMPLE_PAYLOADS,
  type WebhookEventType,
} from "@/lib/webhook-events";

// The Discord app-webhook page shape (docs/console-discord-reference.md §6):
// ONE endpoint per account, then an Events card with a master toggle in its
// header and a grouped per-event checkbox catalog. The test card is the §7
// playground pattern — payload preview on one side, a real signed delivery
// on demand. Secret discipline matches keys: plaintext once, reset-only
// recovery.

function Switch({
  checked,
  disabled,
  onToggle,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onToggle: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onToggle(!checked)}
      className={`relative h-[18px] w-8 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
        checked ? "bg-emerald-500" : "bg-muted-foreground/30"
      }`}
    >
      <span
        className={`absolute top-[2px] size-[14px] rounded-full bg-white transition-transform ${
          checked ? "translate-x-[16px]" : "translate-x-[2px]"
        }`}
      />
    </button>
  );
}

function Checkbox({
  checked,
  disabled,
  onToggle,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onToggle: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onToggle(!checked)}
      className={`flex size-4 shrink-0 items-center justify-center rounded border transition-colors disabled:opacity-50 ${
        checked ? "border-emerald-500 bg-emerald-500 text-white" : "bg-transparent"
      }`}
    >
      {checked ? <HugeiconsIcon icon={Tick02Icon} className="size-3" /> : null}
    </button>
  );
}

/** View-once secret reveal, same anatomy as the Keys create panel. */
function SecretPanel({ secret, onDone }: { secret: string; onDone: () => void }) {
  return (
    <div className="rounded-lg border bg-muted/40 p-3">
      <p className="text-xs text-muted-foreground">
        Your signing secret — this is the only time it will be shown. Every
        delivery is signed with it (<span className="font-mono">x-watchparty-signature</span>).
      </p>
      <div className="mt-2 flex items-center gap-2">
        <code className="min-w-0 flex-1 select-all break-all font-mono text-xs">{secret}</code>
        <CopyButton value={secret} />
      </div>
      <div className="mt-2 flex justify-end">
        <Button size="sm" variant="outline" onClick={onDone}>
          I saved it
        </Button>
      </div>
    </div>
  );
}

function CreateCard() {
  const utils = trpc.useUtils();
  const [url, setUrl] = React.useState("");
  const [secret, setSecret] = React.useState<string | null>(null);
  const create = trpc.developerWebhooks.create.useMutation({
    onSuccess: (data) => {
      setSecret(data.secret);
      void utils.developerWebhooks.get.invalidate();
    },
  });

  if (secret) {
    return (
      <div className="rounded-xl border bg-card p-4 sm:p-5">
        <p className="text-sm font-medium">Endpoint created</p>
        <div className="mt-3">
          <SecretPanel secret={secret} onDone={() => setSecret(null)} />
        </div>
      </div>
    );
  }

  return (
    <form
      className="rounded-xl border bg-card p-4 sm:p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (url.trim()) create.mutate({ url: url.trim() });
      }}
    >
      <p className="text-sm font-medium">Add your endpoint</p>
      <p className="mt-1 text-xs text-muted-foreground">
        A public https URL. We POST signed JSON there the moment an event
        happens — pick which ones below once it&apos;s saved.
      </p>
      <div className="mt-3 flex gap-2">
        <Input
          autoFocus
          placeholder="https://example.com/webhooks/watchparty"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="font-mono"
        />
        <Button type="submit" disabled={!url.trim() || create.isPending}>
          {create.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
      {create.error ? (
        <p className="mt-2 text-xs text-destructive">{create.error.message}</p>
      ) : null}
    </form>
  );
}

function EndpointCard({ hook }: { hook: { url: string; createdAt: Date } }) {
  const utils = trpc.useUtils();
  const [url, setUrl] = React.useState(hook.url);
  const [secret, setSecret] = React.useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = React.useState(false);
  const [confirmingRemove, setConfirmingRemove] = React.useState(false);

  const setUrlMut = trpc.developerWebhooks.setUrl.useMutation({
    onSuccess: () => void utils.developerWebhooks.get.invalidate(),
  });
  const resetSecret = trpc.developerWebhooks.resetSecret.useMutation({
    onSuccess: (data) => {
      setSecret(data.secret);
      setConfirmingReset(false);
    },
  });
  const remove = trpc.developerWebhooks.remove.useMutation({
    onSuccess: () => {
      void utils.developerWebhooks.get.invalidate();
      void utils.developerWebhooks.deliveries.invalidate();
    },
  });

  const dirty = url.trim() !== hook.url;

  return (
    <div className="rounded-xl border bg-card p-4 sm:p-5">
      <p className="text-sm font-medium">Endpoint</p>
      <div className="mt-3 flex gap-2">
        <Input value={url} onChange={(e) => setUrl(e.target.value)} className="font-mono" />
        <Button
          disabled={!dirty || !url.trim() || setUrlMut.isPending}
          onClick={() => setUrlMut.mutate({ url: url.trim() })}
        >
          {setUrlMut.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
      {setUrlMut.error ? (
        <p className="mt-2 text-xs text-destructive">{setUrlMut.error.message}</p>
      ) : null}

      <div className="mt-4">
        {secret ? (
          <SecretPanel secret={secret} onDone={() => setSecret(null)} />
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
            <div>
              <p className="text-xs font-medium">Signing secret</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Hidden for security — shown once when created. Lost it? Reset
                is the only recovery.
              </p>
            </div>
            {confirmingReset ? (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={resetSecret.isPending}
                  onClick={() => resetSecret.mutate()}
                >
                  {resetSecret.isPending ? "Resetting…" : "Confirm reset"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmingReset(false)}>
                  Keep
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setConfirmingReset(true)}>
                Reset secret
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>Created {formatDateTime(hook.createdAt)}</span>
        {confirmingRemove ? (
          <span className="flex items-center gap-2">
            <Button
              size="sm"
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
            >
              {remove.isPending ? "Removing…" : "Confirm remove"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmingRemove(false)}>
              Keep
            </Button>
          </span>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setConfirmingRemove(true)}>
            Remove endpoint
          </Button>
        )}
      </div>
    </div>
  );
}

function EventsCard({ hook }: { hook: { events: string[]; enabled: boolean } }) {
  const utils = trpc.useUtils();
  const setEnabled = trpc.developerWebhooks.setEnabled.useMutation({
    onSuccess: () => void utils.developerWebhooks.get.invalidate(),
  });
  const setEvents = trpc.developerWebhooks.setEvents.useMutation({
    onSuccess: () => void utils.developerWebhooks.get.invalidate(),
  });

  const groups = [...new Set(WEBHOOK_EVENTS.map((e) => e.group))];
  const subscribed = new Set(hook.events);

  const toggle = (type: WebhookEventType, next: boolean) => {
    const nextSet = new Set(hook.events);
    if (next) nextSet.add(type);
    else nextSet.delete(type);
    setEvents.mutate({ events: [...nextSet] as WebhookEventType[] });
  };

  return (
    <div className="rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">Events</p>
          {/* The "(n of cap)" counter pattern, applied to the catalog. */}
          <Chip>
            {subscribed.size} of {WEBHOOK_EVENTS.length} subscribed
          </Chip>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {hook.enabled ? "Delivering" : "Paused"}
          </span>
          <Switch
            checked={hook.enabled}
            disabled={setEnabled.isPending}
            onToggle={(next) => setEnabled.mutate({ enabled: next })}
            label="Deliver events"
          />
        </div>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Every event is about your own account — your streams, your followers,
        your coins, your markets.
      </p>

      <div className="mt-4 flex flex-col gap-4">
        {groups.map((group) => (
          <div key={group}>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{group}</p>
            <div className="mt-1.5 flex flex-col divide-y">
              {WEBHOOK_EVENTS.filter((e) => e.group === group).map((e) => (
                <label
                  key={e.type}
                  className="flex cursor-pointer items-center gap-3 py-2.5"
                >
                  <Checkbox
                    checked={subscribed.has(e.type)}
                    disabled={setEvents.isPending}
                    onToggle={(next) => toggle(e.type, next)}
                    label={e.type}
                  />
                  <span className="font-mono text-xs">{e.type}</span>
                  <span className="flex-1 text-right text-xs text-muted-foreground sm:text-left">
                    {e.desc}
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      {setEvents.error ? (
        <p className="mt-2 text-xs text-destructive">{setEvents.error.message}</p>
      ) : null}
    </div>
  );
}

function TestCard() {
  const utils = trpc.useUtils();
  const [previewType, setPreviewType] = React.useState<string>("webhook.test");
  const sendTest = trpc.developerWebhooks.sendTest.useMutation({
    onSuccess: () => void utils.developerWebhooks.deliveries.invalidate(),
  });

  const payload = {
    id: "evt_1a2b3c4d",
    type: previewType,
    createdAt: new Date(0).toISOString(),
    data: SAMPLE_PAYLOADS[previewType] ?? {},
  };
  const previewTypes = ["webhook.test", ...WEBHOOK_EVENTS.map((e) => e.type)];

  return (
    <div className="rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Payload preview & test</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            What each event looks like on the wire. &ldquo;Send test&rdquo;
            delivers a signed <span className="font-mono">webhook.test</span> to
            your endpoint right now.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" size="sm" className="justify-between gap-2 font-mono text-xs">
                  {previewType}
                  <HugeiconsIcon icon={UnfoldMoreIcon} className="size-3.5 text-muted-foreground" />
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-56">
              {previewTypes.map((t) => (
                <DropdownMenuItem key={t} onClick={() => setPreviewType(t)}>
                  <span className="font-mono text-xs">{t}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            size="sm"
            disabled={sendTest.isPending}
            onClick={() => sendTest.mutate()}
          >
            {sendTest.isPending ? "Sending…" : "Send test"}
          </Button>
        </div>
      </div>

      <pre className="mt-3 overflow-x-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs leading-relaxed">
        {JSON.stringify(payload, null, 2)}
      </pre>
      <p className="mt-2 text-xs text-muted-foreground">
        Deliveries carry{" "}
        <span className="font-mono">x-watchparty-signature: t=&lt;unix&gt;,v1=&lt;hmac&gt;</span>{" "}
        — HMAC-SHA256 of <span className="font-mono">{"`${t}.${body}`"}</span>{" "}
        with your signing secret. Verification snippet in the docs.
      </p>

      {sendTest.data ? (
        <p className="mt-2 text-xs">
          {sendTest.data.ok ? (
            <span className="text-emerald-600 dark:text-emerald-400">
              Delivered — HTTP {sendTest.data.status} in {sendTest.data.durationMs}ms
            </span>
          ) : (
            <span className="text-destructive">
              Failed —{" "}
              {sendTest.data.status === null
                ? "network error or timeout"
                : `HTTP ${sendTest.data.status}`}{" "}
              after {sendTest.data.durationMs}ms
            </span>
          )}
        </p>
      ) : sendTest.error ? (
        <p className="mt-2 text-xs text-destructive">{sendTest.error.message}</p>
      ) : null}
    </div>
  );
}

function DeliveriesCard() {
  const deliveries = trpc.developerWebhooks.deliveries.useQuery();

  return (
    <div className="rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-medium">Recent deliveries</p>
        <p className="text-xs text-muted-foreground">Kept 30 days</p>
      </div>
      <div className="mt-3 flex flex-col divide-y">
        {deliveries.isPending ? (
          <Skeleton className="h-20 rounded-lg" />
        ) : deliveries.error ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            {deliveries.error.message}
          </p>
        ) : deliveries.data.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            No deliveries yet — subscribe to events or send a test.
          </p>
        ) : (
          deliveries.data.map((d) => (
            <div key={d.id} className="flex items-center gap-3 py-2.5">
              <span className="min-w-0 flex-1 truncate font-mono text-xs">{d.event}</span>
              {d.ok ? (
                <Chip tone="good">{d.status}</Chip>
              ) : (
                <Chip tone="bad">{d.status ?? "network"}</Chip>
              )}
              <span className="w-16 text-right text-xs tabular-nums text-muted-foreground">
                {d.durationMs}ms
              </span>
              <span className="hidden text-xs text-muted-foreground sm:block">
                {formatDateTime(d.createdAt)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function WebhooksView() {
  const hook = trpc.developerWebhooks.get.useQuery();

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 sm:p-6">
      <div>
        <h2 className="text-xl font-semibold">Webhooks</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          One signed endpoint per account — your servers hear about events the
          moment they happen.
        </p>
      </div>

      {hook.isPending ? (
        <>
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </>
      ) : hook.error ? (
        <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
          {hook.error.message}
        </div>
      ) : hook.data === null ? (
        <>
          <CreateCard />
          <div className="flex flex-col items-center gap-3 rounded-xl border bg-card p-10 text-center">
            <div className="flex size-10 items-center justify-center rounded-lg border">
              <HugeiconsIcon icon={WebhookIcon} className="size-4 text-muted-foreground" />
            </div>
            <p className="max-w-sm text-xs text-muted-foreground">
              Once your endpoint is saved you&apos;ll pick events here — streams
              going live, new followers, coin launches, prediction results —
              and send signed test deliveries.
            </p>
          </div>
        </>
      ) : (
        <>
          <EndpointCard hook={hook.data} />
          <EventsCard hook={hook.data} />
          <TestCard />
          <DeliveriesCard />
        </>
      )}
    </div>
  );
}
