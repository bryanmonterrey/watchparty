import { BroadcastDetail } from "@/components/studio/broadcast-detail";

// One past (or in-flight) broadcast. The id is not validated here — the
// procedure scopes every read to the caller's own sessions and 404s otherwise,
// so a guessed id reveals nothing and needs no second check.
export default async function BroadcastPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BroadcastDetail id={id} />;
}
