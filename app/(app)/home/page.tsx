// New app home — the entry route after login. Blank starting point for the
// ground-up UI rewrite. The previous app is retired (archived, not routed) in
// app/_legacy/ for reference. Build the new UI from here.
export default function Home() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="font-pixel text-2xl text-foreground">New app</h1>
      <p className="max-w-md text-sm text-postgray">
        Fresh <code className="rounded bg-input1 px-1.5 py-0.5 text-xs">(app)</code> group on the
        working shell. Start building here — the old app is archived in{" "}
        <code className="rounded bg-input1 px-1.5 py-0.5 text-xs">app/_legacy/</code>.
      </p>
    </div>
  );
}
