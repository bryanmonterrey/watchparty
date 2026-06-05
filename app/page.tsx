import Link from "next/link";

// Landing page — to be designed separately. Intentionally minimal for now.
export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center bg-black text-white">
      <Link
        href="/login"
        className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition-colors hover:bg-white/90"
      >
        Go to Login
      </Link>
    </main>
  );
}
