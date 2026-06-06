import Link from "next/link";

// Landing page — to be designed separately. Intentionally minimal for now.
export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center bg-jewel text-white">
      <Link
        href="/login"
        className="rounded-full bg-black cursor-pointer hover:bg-black/90 px-6 py-3 text-sm font-semibold text-white transition-colors"
      >
        Go to Login
      </Link>
    </main>
  );
}
