import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginCard } from "@/components/auth/login-card";
import { getServerSession } from "@/lib/auth/get-session";
import { POST_LOGIN_REDIRECT } from "@/lib/auth/constants";

export const metadata: Metadata = {
  title: "Login",
};

export default async function LoginPage() {
  // Already signed in? Skip the login screen. This uses the REAL session (not
  // the proxy's optimistic cookie check), so a stale cookie can't cause a
  // /login -> /home -> /login redirect loop.
  const session = await getServerSession();
  if (session) redirect(POST_LOGIN_REDIRECT);

  return <LoginCard />;
}
