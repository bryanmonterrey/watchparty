import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { developerApps } from "@/db/schema/content/developer-app";
import { APP_FLAGS } from "@/lib/developer/app-flags";
import { PinkStarLogo } from "@/components/icons";
import { Squircle } from "@/components/ui/squircle";

export const metadata: Metadata = {
  title: "App directory",
  description: "Apps that connect with your watchparty account.",
};

export const revalidate = 300;

// The public "Connect with watchparty" directory. Only apps that cleared the
// verification checklist AND opted in (flags.LISTED, enforced server-side in
// developerApps.setListed) appear. Public columns only — the same predicate as
// developerApps.directory, queried directly since this is a server component.
export default async function AppDirectoryPage() {
  const apps = await db
    .select({
      id: developerApps.id,
      name: developerApps.name,
      description: developerApps.description,
      iconUrl: developerApps.iconUrl,
      tags: developerApps.tags,
      websiteUrl: developerApps.websiteUrl,
    })
    .from(developerApps)
    .where(and(
      isNull(developerApps.deletedAt),
      isNotNull(developerApps.oauthClientId),
      sql`(${developerApps.flags} & ${APP_FLAGS.LISTED}) = ${APP_FLAGS.LISTED}`,
    ))
    .orderBy(desc(developerApps.createdAt))
    .limit(100);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex items-center gap-3">
        <Link href="/" aria-label="watchparty home">
          <PinkStarLogo className="size-8" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">App directory</h1>
          <p className="mt-1 text-sm text-black/60">
            Apps you can sign in to with your watchparty account. Every listed
            app cleared our verification checklist.
          </p>
        </div>
      </header>

      {apps.length === 0 ? (
        <div className="mt-16 text-center">
          <p className="text-lg font-medium">Nothing listed yet</p>
          <p className="mt-2 text-sm text-black/60">
            Building something?{" "}
            <a
              href="https://console.watchparty.xyz"
              className="font-medium text-black underline"
            >
              Add "Sign in with watchparty" to your app
            </a>{" "}
            and be the first.
          </p>
        </div>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {apps.map((app) => (
            <li key={app.id}>
              <Squircle asChild radius={24}>
                <div className="flex w-full flex-col border border-black/10 bg-black/[0.02] p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-black/10 bg-white">
                      {app.iconUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={app.iconUrl} alt="" className="size-full object-cover" />
                      ) : (
                        <span className="text-sm font-semibold text-black/40">
                          {app.name.slice(0, 2)}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold">{app.name}</p>
                      <p className="text-xs text-black/50">Sign in with watchparty</p>
                    </div>
                  </div>
                  {app.description ? (
                    <p className="mt-3 line-clamp-3 flex-1 text-sm text-black/70">
                      {app.description}
                    </p>
                  ) : (
                    <div className="flex-1" />
                  )}
                  {app.tags.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {app.tags.map((t) => (
                        <span
                          key={t}
                          className="rounded-full border border-black/10 px-2 py-0.5 text-xs text-black/60"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {app.websiteUrl ? (
                    <a
                      href={app.websiteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-4 inline-flex h-10 items-center justify-center rounded-full bg-black px-5 text-sm font-medium text-white transition-transform active:scale-[0.97]"
                    >
                      Visit {app.name}
                    </a>
                  ) : null}
                </div>
              </Squircle>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
