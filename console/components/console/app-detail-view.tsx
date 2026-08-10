"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { trpc } from "@/lib/trpc";
import { formatDate } from "@/lib/format";
import { CopyButton } from "@/components/console/copy-button";

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
          <CredentialsCard app={app.data} />
          <DangerZone app={app.data} />
        </>
      )}
    </div>
  );
}
