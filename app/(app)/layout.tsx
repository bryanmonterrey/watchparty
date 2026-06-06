import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/get-session";

// Authenticated app shell. Guards every route in the (app) group: no session
// -> bounce to /login. This is also where heavy client providers (TanStack
// Query, chain/wallet) will live later — kept out of the root layout for speed.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  if (!session) redirect("/login");

  return <div className="flex min-h-dvh flex-col bg-black text-white">{children}</div>;
}
