"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import {
  Key01Icon,
  ArrowUpRight01Icon,
  ArrowRight01Icon,
  AlertCircleIcon,
  CheckmarkCircle02Icon,
  FlashIcon,
  Analytics01Icon,
  WebhookIcon,
  SparklesIcon,
} from "@hugeicons/core-free-icons";
import { trpc } from "@/lib/trpc";
import { useSession } from "@/lib/session";
import { money } from "@/lib/format";
import { SpendChart } from "@/components/console/spend-chart";
import { Chip } from "@/components/console/chip";

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

// The Discord-portal checklist anatomy (console-discord-reference.md §9):
// auto-evaluated criteria rows with ✓/⚠, a computed "n steps left" summary,
// and every pending row linking to its fix. Evaluated from live key data, so
// it's a to-do list, not a form — and it disappears once the journey is done.
function GetStartedChecklist({
  keys,
}: {
  keys: { revoked: boolean; balanceUsd: number; spentUsd: number; lastUsedAt: Date | null }[];
}) {
  const active = keys.filter((k) => !k.revoked);
  const spent = keys.reduce((s, k) => s + k.spentUsd, 0);
  const steps = [
    {
      label: "Create your first key",
      done: active.length > 0,
      href: "/keys",
      external: false,
    },
    {
      label: "Fund a key with USDC credits",
      done: active.some((k) => k.balanceUsd > 0) || spent > 0,
      href: "/credits",
      external: false,
    },
    {
      label: "Make your first API call",
      done: spent > 0 || keys.some((k) => k.lastUsedAt !== null),
      href: "https://docs.watchparty.xyz#auth",
      external: true,
    },
  ];
  const left = steps.filter((s) => !s.done).length;
  if (left === 0) return null;

  return (
    <div className="rounded-xl border bg-card p-4 sm:p-5">
      <p className="text-sm font-medium">Get started</p>
      <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">
        {left === 1 ? "1 step" : `${left} steps`} left before your first API call
      </p>
      <div className="mt-3 flex flex-col divide-y">
        {steps.map((s) => {
          const row = (
            <>
              <HugeiconsIcon
                icon={s.done ? CheckmarkCircle02Icon : AlertCircleIcon}
                className={`size-4 shrink-0 ${
                  s.done
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-amber-600 dark:text-amber-400"
                }`}
              />
              <span className={`flex-1 text-sm ${s.done ? "text-muted-foreground" : ""}`}>
                {s.label}
              </span>
              <HugeiconsIcon
                icon={s.external ? ArrowUpRight01Icon : ArrowRight01Icon}
                className="size-3.5 text-muted-foreground"
              />
            </>
          );
          const cls =
            "flex items-center gap-2.5 py-2.5 transition-colors hover:text-foreground";
          return s.external ? (
            <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" className={cls}>
              {row}
            </a>
          ) : (
            <Link key={s.label} href={s.href} className={cls}>
              {row}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// The portal-level Home cross-sell grid (console-discord-reference.md §14):
// each platform surface gets art-free pitch + CTA, coming-soon surfaces
// included — sold before they exist, honestly labeled.
const CROSS_SELL: {
  icon: IconSvgElement;
  title: string;
  desc: string;
  cta: string;
  href: string;
  external?: boolean;
  soon?: boolean;
}[] = [
  {
    icon: FlashIcon,
    title: "Agent-native payments",
    desc: "The API is x402-native — agents pay per request on-chain, with no key and no account at all.",
    cta: "Get started",
    href: "https://docs.watchparty.xyz#x402",
    external: true,
  },
  {
    icon: Analytics01Icon,
    title: "Market & social data",
    desc: "Coins, charts, posts, streams, and the social graph behind one x-api-key — from $0.001 a call.",
    cta: "See the price sheet",
    href: "/usage",
  },
  {
    icon: WebhookIcon,
    title: "Webhooks",
    desc: "Signed HTTP callbacks the moment your stream goes live, someone follows you, or your coin launches.",
    cta: "Set up",
    href: "/webhooks",
  },
  {
    icon: SparklesIcon,
    title: "Console agent",
    desc: "Describe what you want to build — the agent sets up keys, webhooks, and subscriptions for you.",
    cta: "Open",
    href: "/agent",
  },
];

function CrossSellCard({ card }: { card: (typeof CROSS_SELL)[number] }) {
  const cta = (
    <span className="inline-flex items-center gap-1 text-xs font-medium">
      {card.cta}
      <HugeiconsIcon
        icon={card.external ? ArrowUpRight01Icon : ArrowRight01Icon}
        className="size-3"
      />
    </span>
  );
  return (
    <div className="flex flex-col gap-2.5 rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2.5">
        <div className="flex size-8 items-center justify-center rounded-lg border">
          <HugeiconsIcon icon={card.icon} className="size-4 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium">{card.title}</p>
        {card.soon ? <Chip>Soon</Chip> : null}
      </div>
      <p className="flex-1 text-xs text-muted-foreground">{card.desc}</p>
      {card.external ? (
        <a
          href={card.href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          {cta}
        </a>
      ) : (
        <Link href={card.href} className="text-muted-foreground transition-colors hover:text-foreground">
          {cta}
        </Link>
      )}
    </div>
  );
}

// The Home documentation link-cards (§14): three columns of links, every one
// of them a real destination — docs anchors or console pages, nothing else.
const DOC_CARDS: {
  title: string;
  links: { label: string; href: string; external?: boolean }[];
}[] = [
  {
    title: "Getting started",
    links: [
      { label: "API overview", href: "https://docs.watchparty.xyz#overview", external: true },
      { label: "Authentication", href: "https://docs.watchparty.xyz#auth", external: true },
      { label: "Errors", href: "https://docs.watchparty.xyz#errors", external: true },
    ],
  },
  {
    title: "Paying for usage",
    links: [
      { label: "Pricing", href: "https://docs.watchparty.xyz#pricing", external: true },
      { label: "x402 per-request payments", href: "https://docs.watchparty.xyz#x402", external: true },
      { label: "Buy credits", href: "/credits" },
    ],
  },
  {
    title: "In the console",
    links: [
      { label: "Manage keys", href: "/keys" },
      { label: "Usage & price sheet", href: "/usage" },
      { label: "Payment history", href: "/payments" },
    ],
  },
];

function DocLink({ link }: { link: (typeof DOC_CARDS)[number]["links"][number] }) {
  const inner = (
    <>
      <span className="flex-1 truncate">{link.label}</span>
      <HugeiconsIcon
        icon={link.external ? ArrowUpRight01Icon : ArrowRight01Icon}
        className="size-3 shrink-0 text-muted-foreground"
      />
    </>
  );
  const cls =
    "flex items-center gap-2 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground";
  return link.external ? (
    <a href={link.href} target="_blank" rel="noopener noreferrer" className={cls}>
      {inner}
    </a>
  ) : (
    <Link href={link.href} className={cls}>
      {inner}
    </Link>
  );
}

export function DashboardView() {
  const { data: session } = useSession();
  const keys = trpc.apiKeys.list.useQuery();
  const usage = trpc.apiKeys.usageSeries.useQuery();

  const firstName = session?.user?.name?.split(" ")[0];
  const active = (keys.data ?? []).filter((k) => !k.revoked);
  const totalBalance = active.reduce((s, k) => s + k.balanceUsd, 0);
  const totalSpent = (keys.data ?? []).reduce((s, k) => s + k.spentUsd, 0);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Hello{firstName ? `, ${firstName}` : ""}</h2>
        <Button render={<Link href="/credits" />}>Buy credits</Button>
      </div>

      {keys.data ? <GetStartedChecklist keys={keys.data} /> : null}

      {keys.isPending ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
      ) : keys.error ? (
        <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
          {keys.error.message}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Total balance"
            value={money(totalBalance)}
            hint="Across active keys"
          />
          <StatCard label="Total spent" value={money(totalSpent)} hint="All time" />
          <StatCard
            label="Active keys"
            value={String(active.length)}
            hint={active.length >= 10 ? "At the 10-key limit" : undefined}
          />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="rounded-xl border bg-card p-4 sm:p-5">
          <div className="flex items-baseline justify-between">
            <p className="text-sm font-medium">Usage cost</p>
            <p className="text-xs text-muted-foreground">Last 30 days</p>
          </div>
          <div className="mt-4">
            {usage.isPending ? (
              <Skeleton className="h-48 rounded-lg" />
            ) : usage.error ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                {usage.error.message}
              </p>
            ) : (
              <SpendChart data={usage.data} />
            )}
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Keys</p>
            <Link
              href="/keys"
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Manage keys
            </Link>
          </div>
          <div className="mt-3 flex flex-col gap-1">
            {keys.isPending ? (
              <>
                <Skeleton className="h-12 rounded-lg" />
                <Skeleton className="h-12 rounded-lg" />
              </>
            ) : active.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <div className="flex size-9 items-center justify-center rounded-lg border">
                  <HugeiconsIcon icon={Key01Icon} className="size-4 text-muted-foreground" />
                </div>
                <p className="text-xs text-muted-foreground">
                  No keys yet — create one and you&apos;re calling the API in
                  minutes.
                </p>
                <Button size="sm" variant="outline" render={<Link href="/keys" />}>
                  Create a key
                </Button>
              </div>
            ) : (
              active.slice(0, 5).map((k) => (
                <Link
                  key={k.id}
                  href="/keys"
                  className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-accent/50"
                >
                  <div className="flex size-8 items-center justify-center rounded-lg border">
                    <HugeiconsIcon icon={Key01Icon} className="size-3.5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{k.name}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">{k.prefix}</p>
                  </div>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {money(k.balanceUsd)}
                  </span>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>

      <div>
        <p className="text-sm font-medium">More ways to build on watchparty</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {CROSS_SELL.map((card) => (
            <CrossSellCard key={card.title} card={card} />
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-medium">Documentation</p>
          <a
            href="https://docs.watchparty.xyz"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Docs
            <HugeiconsIcon icon={ArrowUpRight01Icon} className="size-3" />
          </a>
        </div>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          {DOC_CARDS.map((card) => (
            <div key={card.title} className="rounded-xl border bg-card p-4">
              <p className="text-xs font-medium">{card.title}</p>
              <div className="mt-2 flex flex-col divide-y">
                {card.links.map((link) => (
                  <DocLink key={link.label} link={link} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
