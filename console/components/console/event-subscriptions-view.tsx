"use client";

import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { ZapIcon, Tick02Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Chip } from "@/components/console/chip";
import { WEBHOOK_EVENTS } from "@/lib/webhook-events";

// X's Event subscriptions (docs/console-x-reference.md §8): which platform
// events you receive. On watchparty these ARE the webhook subscriptions —
// so this surfaces the real subscribed-event state from the webhook config
// and links to Webhooks to change it (rather than duplicating the toggles).

export function EventSubscriptionsView() {
  const hook = trpc.developerWebhooks.get.useQuery();
  const subscribed = new Set(hook.data?.events ?? []);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Event subscriptions</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Real-time platform events delivered to your endpoint. Manage
            delivery on the Webhooks page.
          </p>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5" render={<Link href="/webhooks" />}>
          Manage webhook
          <HugeiconsIcon icon={ArrowRight01Icon} className="size-3.5" />
        </Button>
      </div>

      {hook.isPending ? (
        <Skeleton className="h-48 rounded-xl" />
      ) : hook.error ? (
        <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
          {hook.error.message}
        </div>
      ) : !hook.data ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border bg-card p-10 text-center">
          <div className="flex size-10 items-center justify-center rounded-lg border">
            <HugeiconsIcon icon={ZapIcon} className="size-4 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">No endpoint yet</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            Add a webhook endpoint, then subscribe to the events you want
            delivered.
          </p>
          <Button size="sm" render={<Link href="/webhooks" />}>
            Set up webhooks
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <p className="text-sm font-medium">Subscribed events</p>
            <div className="flex items-center gap-2">
              {hook.data.enabled ? (
                <Chip tone="good">Delivering</Chip>
              ) : (
                <Chip tone="bad">Paused</Chip>
              )}
              <span className="text-xs text-muted-foreground">
                {subscribed.size} of {WEBHOOK_EVENTS.length}
              </span>
            </div>
          </div>
          <div className="flex flex-col divide-y">
            {WEBHOOK_EVENTS.map((e) => {
              const on = subscribed.has(e.type);
              return (
                <div key={e.type} className="flex items-center gap-3 px-4 py-2.5">
                  <span
                    className={`flex size-5 items-center justify-center rounded-full ${
                      on ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "border text-transparent"
                    }`}
                  >
                    <HugeiconsIcon icon={Tick02Icon} className="size-3" />
                  </span>
                  <span className="font-mono text-xs">{e.type}</span>
                  <span className="flex-1 text-right text-xs text-muted-foreground sm:text-left">
                    {e.desc}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
