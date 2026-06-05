// Auth route group — its own minimal shell. Deliberately imports NO providers
// and NO chain/wallet SDKs, so the login bundle stays tiny. Heavy providers live
// in the (app) group instead.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-dvh flex-col bg-black text-white">{children}</div>;
}
