import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginCard } from "@/components/auth/login-card";
import { getServerSession } from "@/lib/auth/get-session";
import { resolvePostLoginRedirect } from "@/lib/auth/constants";

export const metadata: Metadata = {
  title: "Login",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;
  // Already signed in? Skip the login screen. This uses the REAL session (not
  // the proxy's optimistic cookie check), so a stale cookie can't cause a
  // /login -> /home -> /login redirect loop. Honors a same-site callbackUrl so a
  // logged-in user sent here from ads.watchparty.xyz bounces straight back.
  const session = await getServerSession();
  if (session) redirect(resolvePostLoginRedirect(callbackUrl));

  return <LoginCard callbackUrl={callbackUrl} />;
}
