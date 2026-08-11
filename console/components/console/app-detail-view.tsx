"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { trpc } from "@/lib/trpc";
import { formatDate, money } from "@/lib/format";
import { CopyButton } from "@/components/console/copy-button";
import { Chip } from "@/components/console/chip";
import { BOT_PERMISSIONS, BOT_PERMISSION_META, hasPermission } from "@/lib/bot-permissions";

// The Discord General Information page (docs/console-discord-reference.md §1):
// identity (icon/name/description/tags), read-only IDs with copy buttons
// (Application ID public; Public Key public — the signing identity, its
// private half never leaves the server), ToS/privacy fields, and a red danger
// zone at the bottom. Keys/webhooks/bot tabs land in later phases.

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-medium">{label}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      <div className="mt-2">{children}</div>
    </div>
  );
}

function ReadonlyId({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3">
        <code className={`min-w-0 flex-1 select-all break-all text-xs ${mono ? "font-mono" : ""}`}>
          {value}
        </code>
        <CopyButton value={value} />
      </div>
    </Field>
  );
}

type App = {
  id: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  tags: string[];
  publicKey: string;
  tosUrl: string | null;
  privacyUrl: string | null;
  createdAt: Date;
};

function IdentityCard({ app }: { app: App }) {
  const utils = trpc.useUtils();
  const [name, setName] = React.useState(app.name);
  const [description, setDescription] = React.useState(app.description ?? "");
  const [iconUrl, setIconUrl] = React.useState(app.iconUrl ?? "");
  const [tags, setTags] = React.useState(app.tags.join(", "));
  const [tosUrl, setTosUrl] = React.useState(app.tosUrl ?? "");
  const [privacyUrl, setPrivacyUrl] = React.useState(app.privacyUrl ?? "");

  const update = trpc.developerApps.update.useMutation({
    onSuccess: () => {
      void utils.developerApps.get.invalidate({ id: app.id });
      void utils.developerApps.list.invalidate();
    },
  });

  const parsedTags = tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 5);

  const dirty =
    name.trim() !== app.name ||
    description !== (app.description ?? "") ||
    iconUrl !== (app.iconUrl ?? "") ||
    tosUrl !== (app.tosUrl ?? "") ||
    privacyUrl !== (app.privacyUrl ?? "") ||
    parsedTags.join(",") !== app.tags.join(",");

  return (
    <div className="rounded-xl border bg-card p-4 sm:p-5">
      <p className="text-sm font-medium">General information</p>
      <p className="mt-1 text-xs text-muted-foreground">
        What should we call your app, and what does it do? This is what people
        see when they connect it.
      </p>

      <div className="mt-4 flex flex-col gap-4">
        <Field label="Name">
          <Input maxLength={64} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Description" hint="Up to 400 characters.">
          <textarea
            maxLength={400}
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full resize-none rounded-lg border bg-transparent p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </Field>
        <Field label="Icon URL" hint="A public https image URL.">
          <Input
            value={iconUrl}
            onChange={(e) => setIconUrl(e.target.value)}
            placeholder="https://…/icon.png"
            className="font-mono"
          />
        </Field>
        <Field label="Tags" hint="Up to 5, comma-separated.">
          <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="trading, bot" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Terms of Service URL">
            <Input
              value={tosUrl}
              onChange={(e) => setTosUrl(e.target.value)}
              placeholder="https://…"
              className="font-mono"
            />
          </Field>
          <Field label="Privacy Policy URL">
            <Input
              value={privacyUrl}
              onChange={(e) => setPrivacyUrl(e.target.value)}
              placeholder="https://…"
              className="font-mono"
            />
          </Field>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button
          disabled={!dirty || !name.trim() || update.isPending}
          onClick={() =>
            update.mutate({
              id: app.id,
              name: name.trim(),
              description: description || undefined,
              iconUrl: iconUrl || undefined,
              tags: parsedTags,
              tosUrl: tosUrl || undefined,
              privacyUrl: privacyUrl || undefined,
            })
          }
        >
          {update.isPending ? "Saving…" : "Save changes"}
        </Button>
        {update.error ? (
          <p className="text-xs text-destructive">{update.error.message}</p>
        ) : update.isSuccess && !dirty ? (
          <p className="text-xs text-emerald-600 dark:text-emerald-400">Saved</p>
        ) : null}
      </div>
    </div>
  );
}

function CredentialsCard({ app }: { app: App }) {
  const utils = trpc.useUtils();
  const [confirmingRotate, setConfirmingRotate] = React.useState(false);
  const rotate = trpc.developerApps.rotateKey.useMutation({
    onSuccess: () => {
      void utils.developerApps.get.invalidate({ id: app.id });
      setConfirmingRotate(false);
    },
  });

  return (
    <div className="rounded-xl border bg-card p-4 sm:p-5">
      <p className="text-sm font-medium">Credentials</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Both values are public. The public key verifies deliveries we sign for
        this app — its private half never leaves our servers.
      </p>
      <div className="mt-4 flex flex-col gap-4">
        <ReadonlyId label="Application ID" value={app.id} mono />
        <ReadonlyId label="Public key (Ed25519)" value={app.publicKey} mono />
      </div>
      <div className="mt-4 flex items-center gap-3">
        {confirmingRotate ? (
          <>
            <Button
              size="sm"
              variant="destructive"
              disabled={rotate.isPending}
              onClick={() => rotate.mutate({ id: app.id })}
            >
              {rotate.isPending ? "Rotating…" : "Confirm rotate"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmingRotate(false)}>
              Keep
            </Button>
            <p className="text-xs text-muted-foreground">
              Old signatures stop verifying immediately.
            </p>
          </>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setConfirmingRotate(true)}>
            Rotate signing key
          </Button>
        )}
      </div>
    </div>
  );
}

function KeysCard({ appId }: { appId: string }) {
  const utils = trpc.useUtils();
  const keys = trpc.apiKeys.list.useQuery();
  const [creating, setCreating] = React.useState(false);
  const [name, setName] = React.useState("");
  const create = trpc.apiKeys.create.useMutation({
    onSuccess: () => {
      void utils.apiKeys.list.invalidate();
      setName("");
    },
  });

  const appKeys = (keys.data ?? []).filter((k) => k.appId === appId && !k.revoked);

  return (
    <div className="rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">Keys</p>
        {!creating && !create.data ? (
          <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
            New key
          </Button>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Keys filed under this app. They send <span className="font-mono">x-api-key</span>{" "}
        and draw down their own credit balance.
      </p>

      {create.data ? (
        <div className="mt-3 rounded-lg border bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground">
            Your new key — shown once. Store it somewhere safe.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 select-all break-all font-mono text-xs">
              {create.data.key}
            </code>
            <CopyButton value={create.data.key} />
          </div>
          <div className="mt-2 flex justify-end">
            <Button size="sm" variant="outline" onClick={() => create.reset()}>
              Done
            </Button>
          </div>
        </div>
      ) : creating ? (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create.mutate({ name: name.trim(), appId });
          }}
        >
          <Input
            autoFocus
            maxLength={64}
            placeholder="Production key"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit" disabled={!name.trim() || create.isPending}>
            {create.isPending ? "Creating…" : "Create"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setCreating(false)}>
            Cancel
          </Button>
        </form>
      ) : null}
      {create.error ? (
        <p className="mt-2 text-xs text-destructive">{create.error.message}</p>
      ) : null}

      <div className="mt-3 flex flex-col divide-y">
        {keys.isPending ? (
          <Skeleton className="h-12 rounded-lg" />
        ) : appKeys.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            No keys under this app yet.
          </p>
        ) : (
          appKeys.map((k) => (
            <Link
              key={k.id}
              href="/keys"
              className="flex items-center gap-3 py-2.5 transition-colors hover:text-foreground"
            >
              <span className="min-w-0 flex-1 truncate text-sm">{k.name}</span>
              <Chip>
                <span className="font-mono">{k.prefix}</span>
              </Chip>
              <span className="text-xs tabular-nums text-muted-foreground">
                {money(k.balanceUsd)}
              </span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

function BotTokenPanel({ token, onDone }: { token: string; onDone: () => void }) {
  return (
    <div className="rounded-lg border bg-muted/40 p-3">
      <p className="text-xs text-muted-foreground">
        Your bot token — shown once. Send it as{" "}
        <span className="font-mono">Authorization: Bot &lt;token&gt;</span>. Store
        it safely; reset is the only recovery.
      </p>
      <div className="mt-2 flex items-center gap-2">
        <code className="min-w-0 flex-1 select-all break-all font-mono text-xs">{token}</code>
        <CopyButton value={token} />
      </div>
      <div className="mt-2 flex justify-end">
        <Button size="sm" variant="outline" onClick={onDone}>
          I saved it
        </Button>
      </div>
    </div>
  );
}

function PermissionToggles({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {BOT_PERMISSION_META.map((p) => {
        const bit = BOT_PERMISSIONS[p.name];
        const on = hasPermission(value, bit);
        return (
          <button
            key={p.name}
            type="button"
            disabled={disabled}
            title={p.desc}
            onClick={() => onChange(on ? value & ~bit : value | bit)}
            className={
              "rounded-full border px-2.5 py-1 text-xs transition-colors disabled:opacity-50 " +
              (on
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground")
            }
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

// Where the bot is installed + its per-community permissions. A bot can be added
// only to communities the caller owns or admins (server-enforced); the toggles
// write the same bitfield the bot-facing endpoints check, so what you grant here
// is exactly what the bot can do there.
function BotInstalls({ appId }: { appId: string }) {
  const utils = trpc.useUtils();
  const installs = trpc.developerBots.listInstalls.useQuery({ appId });
  const installable = trpc.developerBots.installableCommunities.useQuery();

  const invalidate = () => void utils.developerBots.listInstalls.invalidate({ appId });
  const setPerms = trpc.developerBots.setPermissions.useMutation({ onSuccess: invalidate });
  const uninstall = trpc.developerBots.uninstall.useMutation({ onSuccess: invalidate });

  const [draftServer, setDraftServer] = React.useState("");
  const [draftPerms, setDraftPerms] = React.useState<number>(BOT_PERMISSIONS.READ_MEMBERS);
  const install = trpc.developerBots.install.useMutation({
    onSuccess: () => {
      invalidate();
      setDraftServer("");
      setDraftPerms(BOT_PERMISSIONS.READ_MEMBERS);
    },
  });

  const installedIds = new Set((installs.data ?? []).map((i) => i.serverId));
  const available = (installable.data ?? []).filter((c) => !installedIds.has(c.id));

  return (
    <div className="mt-2 border-t pt-3">
      <p className="text-xs font-medium">Communities</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Where this bot is installed and what it may do. It can act only in
        communities you own or admin.
      </p>

      {installs.isPending ? (
        <div className="mt-2 h-9 animate-pulse rounded-lg bg-muted/40" />
      ) : installs.data && installs.data.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-2">
          {installs.data.map((i) => (
            <li key={i.serverId} className="rounded-lg border bg-muted/20 p-2.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium">{i.name}</span>
                <span className="font-mono text-xs text-muted-foreground">{i.permissions}</span>
                <div className="flex-1" />
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={uninstall.isPending}
                  onClick={() => uninstall.mutate({ appId, serverId: i.serverId })}
                >
                  Remove
                </Button>
              </div>
              <div className="mt-2">
                <PermissionToggles
                  value={i.permissions}
                  disabled={setPerms.isPending}
                  onChange={(v) => setPerms.mutate({ appId, serverId: i.serverId, permissions: v })}
                />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">Not installed anywhere yet.</p>
      )}

      {available.length > 0 ? (
        <div className="mt-3 rounded-lg border border-dashed p-2.5">
          <p className="text-xs font-medium">Add to a community</p>
          <select
            value={draftServer}
            onChange={(e) => setDraftServer(e.target.value)}
            className="mt-2 w-full rounded-lg border bg-background px-2.5 py-1.5 text-xs"
          >
            <option value="">Select a community…</option>
            {available.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <div className="mt-2">
            <PermissionToggles value={draftPerms} onChange={setDraftPerms} disabled={install.isPending} />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Button
              size="sm"
              disabled={!draftServer || install.isPending}
              onClick={() => install.mutate({ appId, serverId: draftServer, permissions: draftPerms })}
            >
              {install.isPending ? "Installing…" : "Install"}
            </Button>
            {install.error ? (
              <span className="text-xs text-destructive">{install.error.message}</span>
            ) : null}
          </div>
        </div>
      ) : installable.data && installable.data.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          You don&apos;t own or admin any communities yet — create one to install
          this bot.
        </p>
      ) : null}
    </div>
  );
}

function BotCard({ appId }: { appId: string }) {
  const utils = trpc.useUtils();
  const bot = trpc.developerBots.get.useQuery({ appId });
  const [freshToken, setFreshToken] = React.useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = React.useState(false);
  const [confirmingRemove, setConfirmingRemove] = React.useState(false);

  const create = trpc.developerBots.create.useMutation({
    onSuccess: (d) => {
      setFreshToken(d.token);
      void utils.developerBots.get.invalidate({ appId });
    },
  });
  const reset = trpc.developerBots.resetToken.useMutation({
    onSuccess: (d) => {
      setFreshToken(d.token);
      setConfirmingReset(false);
    },
  });
  const remove = trpc.developerBots.remove.useMutation({
    onSuccess: () => {
      setConfirmingRemove(false);
      void utils.developerBots.get.invalidate({ appId });
    },
  });

  return (
    <div className="rounded-xl border bg-card p-4 sm:p-5">
      <p className="text-sm font-medium">Bot</p>
      <p className="mt-1 text-xs text-muted-foreground">
        A bot user for this app — one per app. It authenticates with a token
        (never a login) and acts as its own identity.
      </p>

      {freshToken ? (
        <div className="mt-3">
          <BotTokenPanel token={freshToken} onDone={() => setFreshToken(null)} />
        </div>
      ) : bot.isPending ? (
        <div className="mt-3 h-10 animate-pulse rounded-lg bg-muted/40" />
      ) : bot.data ? (
        <div className="mt-3 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Chip>{bot.data.name ?? "Bot"}</Chip>
            {bot.data.username ? (
              <span className="font-mono text-xs text-muted-foreground">@{bot.data.username}</span>
            ) : null}
            <div className="flex-1" />
            {confirmingReset ? (
              <div className="flex items-center gap-2">
                <Button size="sm" variant="destructive" disabled={reset.isPending} onClick={() => reset.mutate({ appId })}>
                  {reset.isPending ? "Resetting…" : "Confirm reset"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmingReset(false)}>Keep</Button>
              </div>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setConfirmingReset(true)}>
                Reset token
              </Button>
            )}
          </div>
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>Created {formatDate(bot.data.createdAt)}</span>
            {confirmingRemove ? (
              <span className="flex items-center gap-2">
                <Button size="sm" variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate({ appId })}>
                  {remove.isPending ? "Removing…" : "Confirm remove"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmingRemove(false)}>Keep</Button>
              </span>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setConfirmingRemove(true)}>Remove bot</Button>
            )}
          </div>
          {reset.error ? <p className="text-xs text-destructive">{reset.error.message}</p> : null}
          <BotInstalls appId={appId} />
        </div>
      ) : (
        <div className="mt-3">
          <Button size="sm" disabled={create.isPending} onClick={() => create.mutate({ appId })}>
            {create.isPending ? "Creating…" : "Create bot"}
          </Button>
          {create.error ? <p className="mt-2 text-xs text-destructive">{create.error.message}</p> : null}
        </div>
      )}
    </div>
  );
}

function DangerZone({ app }: { app: App }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [confirming, setConfirming] = React.useState(false);
  const remove = trpc.developerApps.remove.useMutation({
    onSuccess: () => {
      void utils.developerApps.list.invalidate();
      router.push("/apps");
    },
  });

  return (
    <div className="rounded-xl border border-destructive/30 bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Delete app</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Permanent. Its credentials stop working and the id can never be
            reused.
          </p>
        </div>
        {confirming ? (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => remove.mutate({ id: app.id })}
            >
              {remove.isPending ? "Deleting…" : "Confirm delete"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Keep
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="destructive" onClick={() => setConfirming(true)}>
            Delete app
          </Button>
        )}
      </div>
    </div>
  );
}

// Discord §9 verification checklist: self-evaluated trust criteria, computed
// server-side (developerApps.verificationChecklist). ✓ met / ⚠ missing rows and
// a "n of m" summary — the gate an app clears before it scales or lists publicly.
function VerificationCard({ appId }: { appId: string }) {
  const check = trpc.developerApps.verificationChecklist.useQuery({ appId });

  return (
    <div className="rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Verification</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Clear these before your app scales or lists publicly.
          </p>
        </div>
        {check.data ? (
          check.data.complete ? (
            <Chip tone="good">All set</Chip>
          ) : (
            <Chip tone="warn">{check.data.total - check.data.met} to go</Chip>
          )
        ) : null}
      </div>

      {check.isPending ? (
        <div className="mt-3 h-32 animate-pulse rounded-lg bg-muted/40" />
      ) : check.error ? (
        <p className="mt-3 text-xs text-destructive">{check.error.message}</p>
      ) : check.data ? (
        <ul className="mt-3 flex flex-col divide-y">
          {check.data.criteria.map((c) => (
            <li key={c.key} className="flex items-center gap-3 py-2.5">
              <span
                className={`flex size-5 shrink-0 items-center justify-center rounded-full ${
                  c.met
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                    : "border border-amber-500/50 text-transparent"
                }`}
              >
                <HugeiconsIcon icon={Tick02Icon} className="size-3" />
              </span>
              <div className="min-w-0 flex-1">
                <p className={`text-sm ${c.met ? "" : "font-medium"}`}>{c.label}</p>
                <p className="text-xs text-muted-foreground">{c.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function AppDetailView({ id }: { id: string }) {
  const app = trpc.developerApps.get.useQuery({ id });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6">
      <Link
        href="/apps"
        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} className="size-3.5" />
        Apps
      </Link>

      {app.isPending ? (
        <>
          <Skeleton className="h-8 w-48 rounded-md" />
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </>
      ) : app.error ? (
        <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
          {app.error.message}
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center overflow-hidden rounded-lg border bg-muted/40">
              {app.data.iconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={app.data.iconUrl} alt="" className="size-full object-cover" />
              ) : (
                <span className="text-xs font-medium text-muted-foreground">
                  {app.data.name.slice(0, 2)}
                </span>
              )}
            </div>
            <div>
              <h2 className="text-xl font-semibold">{app.data.name}</h2>
              <p className="text-xs text-muted-foreground">
                Created {formatDate(app.data.createdAt)}
              </p>
            </div>
          </div>

          <IdentityCard app={app.data} />
          <VerificationCard appId={app.data.id} />
          <CredentialsCard app={app.data} />
          <KeysCard appId={app.data.id} />
          <BotCard appId={app.data.id} />
          <DangerZone app={app.data} />
        </>
      )}
    </div>
  );
}
