import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { oauthClient } from "@/db/schema/auth";
import { developerApps } from "@/db/schema/content/developer-app";
import { getServerSession } from "@/lib/auth/get-session";
import { describeScopes } from "@/lib/developer/oauth-scopes";
import { ConsentCard, ConsentError } from "@/components/auth/consent-card";

export const metadata: Metadata = {
  title: "Authorize",
};

// OAuth2 consent screen — the oauth-provider plugin redirects here carrying
// the WHOLE authorize query, HMAC-signed: the original params plus `exp`,
// `ba_iat`, one `ba_param` entry per signed name, and `sig` over the
// canonicalized set. There is no consent_code and no cookie anymore. The card
// POSTs {accept, oauth_query} (rebuilt client-side from location.search) to
// /api/auth/oauth2/consent and follows the returned {redirect, url}.
//
// Anonymous visitors never normally land here (authorize bounces them to
// /login first, carrying the same signed query) — the redirect below covers
// stale-link stragglers, and it MUST preserve EVERY query param: dropping one
// breaks the signature and dead-ends the flow.
export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) query.append(key, v);
  }
  const clientId = query.get("client_id");
  const scope = query.get("scope");

  const session = await getServerSession();
  if (!session) {
    redirect(`/login?${query.toString()}`);
  }

  if (!clientId || !query.get("sig")) {
    return <ConsentError message="This authorization link is missing its client. Close this page and try again from the app you were using." />;
  }

  const [client] = await db
    .select({
      name: oauthClient.name,
      icon: oauthClient.icon,
      disabled: oauthClient.disabled,
    })
    .from(oauthClient)
    .where(eq(oauthClient.clientId, clientId))
    .limit(1);

  if (!client || client.disabled) {
    return <ConsentError message="This app can't sign people in right now. Close this page and contact the app's developer." />;
  }

  // The app-registry row carries ToS/privacy + verification-relevant identity.
  const [app] = await db
    .select({
      tosUrl: developerApps.tosUrl,
      privacyUrl: developerApps.privacyUrl,
    })
    .from(developerApps)
    .where(and(eq(developerApps.oauthClientId, clientId), isNull(developerApps.deletedAt)))
    .limit(1);

  const scopes = describeScopes(scope ?? "openid");

  return (
    <ConsentCard
      appName={client.name ?? "This app"}
      appIcon={client.icon}
      tosUrl={app?.tosUrl ?? null}
      privacyUrl={app?.privacyUrl ?? null}
      scopes={scopes.map(({ scope: s, label, desc }) => ({ scope: s, label, desc }))}
      accountName={session.user.name ?? session.user.username ?? ""}
      accountAvatar={session.user.avatar_url ?? null}
    />
  );
}
