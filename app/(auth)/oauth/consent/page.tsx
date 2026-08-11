import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { oauthApplication } from "@/db/schema/auth";
import { developerApps } from "@/db/schema/content/developer-app";
import { getServerSession } from "@/lib/auth/get-session";
import { describeScopes } from "@/lib/developer/oauth-scopes";
import { ConsentCard, ConsentError } from "@/components/auth/consent-card";

export const metadata: Metadata = {
  title: "Authorize",
};

// OAuth2 consent screen — the oidc-provider plugin redirects here with
// consent_code / client_id / scope when a (session-holding) user authorizes a
// third-party client. consent_code may be absent: the plugin also carries it
// in the signed oidc_consent_prompt cookie, and the consent endpoint falls
// back to that. Approve/Deny POST to /api/auth/oauth2/consent (session-authed)
// and follow the returned redirectURI. Anonymous visitors never normally land
// here (authorize bounces them to /login first) — the redirect below covers
// stale-cookie stragglers.
export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ consent_code?: string; client_id?: string; scope?: string }>;
}) {
  const { consent_code, client_id, scope } = await searchParams;

  const session = await getServerSession();
  if (!session) {
    const params = new URLSearchParams();
    if (consent_code) params.set("consent_code", consent_code);
    if (client_id) params.set("client_id", client_id);
    if (scope) params.set("scope", scope);
    redirect(`/login?callbackUrl=${encodeURIComponent(`/oauth/consent?${params.toString()}`)}`);
  }

  if (!client_id) {
    return <ConsentError message="This authorization link is missing its client. Close this page and try again from the app you were using." />;
  }

  const [client] = await db
    .select({
      name: oauthApplication.name,
      icon: oauthApplication.icon,
      disabled: oauthApplication.disabled,
    })
    .from(oauthApplication)
    .where(eq(oauthApplication.clientId, client_id))
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
    .where(and(eq(developerApps.oauthClientId, client_id), isNull(developerApps.deletedAt)))
    .limit(1);

  const scopes = describeScopes(scope ?? "openid");

  return (
    <ConsentCard
      appName={client.name}
      appIcon={client.icon}
      tosUrl={app?.tosUrl ?? null}
      privacyUrl={app?.privacyUrl ?? null}
      scopes={scopes.map(({ scope: s, label, desc }) => ({ scope: s, label, desc }))}
      consentCode={consent_code ?? null}
      accountName={session.user.name ?? session.user.username ?? ""}
      accountAvatar={session.user.avatar_url ?? null}
    />
  );
}
