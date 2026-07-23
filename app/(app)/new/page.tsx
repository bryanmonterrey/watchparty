// Starter page for the new UI build. Served at /new — a conflict-free path so
// the legacy app keeps owning /home, /trade, /discover, … while this is built.
// Rename/replace this route as the new UI takes shape.
export default function NewAppStarter() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="font-pixel text-2xl text-foreground">New UI</h1>
      <p className="max-w-md text-sm text-postgray">
        Fresh <code className="rounded bg-input1 px-1.5 py-0.5 text-xs">(app)</code> group,
        built on the same shell. The previous app is preserved in{" "}
        <code className="rounded bg-input1 px-1.5 py-0.5 text-xs">(app-legacy)</code> and
        still live at its current routes.
      </p>
    </div>
  );
}
