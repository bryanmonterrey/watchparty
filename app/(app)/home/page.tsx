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
      
    </main>
  );
}
