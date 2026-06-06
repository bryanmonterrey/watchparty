import { getServerSession } from "@/lib/auth/get-session";
import { SignOutButton } from "@/components/auth/sign-out-button";

// Temporary authenticated landing — confirms sign-in worked and gives a way to
// sign out for repeat testing. To be replaced by the real app home.
export default async function AppHome() {
  const session = await getServerSession();
  const user = session?.user as
    | { id: string; name?: string | null; email?: string | null; walletAddress?: string | null }
    | undefined;

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="text-sm font-semibold text-[#00ED89]">✓ Signed in</span>
      <h1 className="text-2xl font-semibold tracking-tight">
        Welcome{user?.name ? `, ${user.name}` : ""}
      </h1>
      {(user?.email || user?.walletAddress) && (
        <span className="text-[13px] text-zinc-300">{user.email || user.walletAddress}</span>
      )}
      <span className="font-mono text-[11px] text-zinc-500">{user?.id}</span>
      <SignOutButton />
    </main>
  );
}
