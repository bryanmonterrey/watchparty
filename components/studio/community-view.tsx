"use client";

import * as React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ShieldIcon, StarIcon, UserBlock01Icon } from "@hugeicons/core-free-icons";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { Button } from "@/components/ui/button";

// Community & moderation (studio S4), Kick's lighter model. Surfaces
// creator.getModerators/getVIPs (+ remove) and moderation.getBannedUsers
// (+ unban), plus the welcome-message editor — all already in the backend.
// Adding mods/VIPs happens from chat/profile today; this manages the roster.

type Person = {
  id: string;
  name: string;
  username: string | null;
  avatar_url: string | null;
};

function PersonRow({ p, sub, action }: { p: Person; sub?: string; action: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      {/* House rule: brand avatar fallback, never letter initials. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={p.avatar_url ?? "/avatar.png"} alt="" className="size-8 rounded-full object-cover" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{p.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {p.username ? `@${p.username}` : ""}
          {sub ? ` · ${sub}` : ""}
        </p>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

function RosterCard({
  icon,
  title,
  empty,
  children,
}: {
  icon: typeof ShieldIcon;
  title: string;
  empty: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <HugeiconsIcon icon={icon} className="size-4 text-muted-foreground" />
        <p className="text-sm font-medium">{title}</p>
      </div>
      <div className="mt-2 flex flex-col divide-y">
        {empty ? <p className="py-6 text-center text-xs text-muted-foreground">None yet.</p> : children}
      </div>
    </div>
  );
}

function WelcomeCard() {
  const utils = trpc.useUtils();
  const cfg = trpc.creator.getWelcomeMessage.useQuery();
  const [enabled, setEnabled] = React.useState(false);
  const [message, setMessage] = React.useState("");
  React.useEffect(() => {
    if (cfg.data) {
      setEnabled(cfg.data.enabled ?? false);
      setMessage(cfg.data.message ?? "");
    }
  }, [cfg.data]);
  const save = trpc.creator.setWelcomeMessage.useMutation({
    onSuccess: () => void utils.creator.getWelcomeMessage.invalidate(),
  });
  const dirty = enabled !== (cfg.data?.enabled ?? false) || message !== (cfg.data?.message ?? "");

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Welcome message</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Greets first-time chatters.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => setEnabled((e) => !e)}
          className={`relative h-[18px] w-8 shrink-0 rounded-full transition-colors ${enabled ? "bg-emerald-500" : "bg-muted-foreground/30"}`}
        >
          <span className={`absolute top-[2px] size-[14px] rounded-full bg-white transition-transform ${enabled ? "translate-x-[16px]" : "translate-x-[2px]"}`} />
        </button>
      </div>
      <textarea
        value={message}
        maxLength={1000}
        rows={3}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Welcome to the stream! Say hi 👋"
        className="mt-3 w-full resize-none rounded-xl border border-border/60 bg-transparent p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <div className="mt-2 flex items-center gap-3">
        <Button size="sm" disabled={!dirty || save.isPending} onClick={() => save.mutate({ enabled, message })}>
          {save.isPending ? "Saving…" : "Save"}
        </Button>
        {save.isSuccess && !dirty ? <span className="text-xs text-emerald-600 dark:text-emerald-400">Saved</span> : null}
      </div>
    </div>
  );
}

export function CommunityView() {
  const utils = trpc.useUtils();
  const { data: session } = useAuthSession();
  const creatorId = session?.user?.id ?? "";

  const mods = trpc.creator.getModerators.useQuery({ creatorId }, { enabled: !!creatorId });
  const vips = trpc.creator.getVIPs.useQuery({ creatorId }, { enabled: !!creatorId });
  const banned = trpc.moderation.getBannedUsers.useQuery(undefined, { enabled: !!creatorId });

  const removeMod = trpc.creator.removeModerator.useMutation({
    onSuccess: () => void utils.creator.getModerators.invalidate(),
  });
  const removeVip = trpc.creator.removeVIP.useMutation({
    onSuccess: () => void utils.creator.getVIPs.invalidate(),
  });
  const unban = trpc.moderation.unbanUser.useMutation({
    onSuccess: () => void utils.moderation.getBannedUsers.invalidate(),
  });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-semibold">Community</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Your moderators, VIPs, banned viewers, and chat welcome.
        </p>
      </div>

      <RosterCard icon={ShieldIcon} title="Moderators" empty={!mods.data?.length}>
        {(mods.data ?? []).map((m) => (
          <PersonRow
            key={m.id}
            p={m}
            action={
              <Button size="sm" variant="ghost" disabled={removeMod.isPending} onClick={() => removeMod.mutate({ moderatorId: m.id })}>
                Remove
              </Button>
            }
          />
        ))}
      </RosterCard>

      <RosterCard icon={StarIcon} title="VIPs" empty={!vips.data?.length}>
        {(vips.data ?? []).map((v) => (
          <PersonRow
            key={v.id}
            p={v}
            sub={v.note ?? undefined}
            action={
              <Button size="sm" variant="ghost" disabled={removeVip.isPending} onClick={() => removeVip.mutate({ memberId: v.id })}>
                Remove
              </Button>
            }
          />
        ))}
      </RosterCard>

      <RosterCard icon={UserBlock01Icon} title="Banned" empty={!banned.data?.length}>
        {(banned.data ?? []).map((b) => (
          <PersonRow
            key={b.id}
            p={b}
            sub={b.reason ?? undefined}
            action={
              <Button size="sm" variant="ghost" disabled={unban.isPending} onClick={() => unban.mutate({ userId: b.id })}>
                Unban
              </Button>
            }
          />
        ))}
      </RosterCard>

      <WelcomeCard />
    </div>
  );
}
