import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/get-session";
import { ReactQueryProvider } from "@/components/react-query-provider";

// Authenticated app shell. Guards every route in the (app) group: no session
// -> bounce to /login. Data providers (TanStack Query + tRPC) live here, scoped
// to the app — NOT the root layout — so login/landing stay light. Heavy chain
// SDKs (Solana/EVM) stay lazy and load only where wallet features are used,
// rather than the old app's eager app-wide SolanaProvider.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  if (!session) redirect("/login");

  return (
    <ReactQueryProvider>
      <div className="flex min-h-dvh flex-col bg-black text-white">{children}</div>
    </ReactQueryProvider>
  );
}
