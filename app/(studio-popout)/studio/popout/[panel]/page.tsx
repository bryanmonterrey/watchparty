import { notFound } from "next/navigation";
import { getServerSession } from "@/lib/auth/get-session";
import { PopoutPanel, POPOUT_PANELS, type PopoutPanelKey } from "@/components/studio/popout-panel";

// One live panel, alone, for a second monitor.
//
// The panel key is validated here rather than trusted: `[panel]` is whatever
// the address bar says, and rendering an unknown key as "nothing" would look
// like a broken window instead of a wrong URL.
export default async function StudioPopoutPage({
  params,
}: {
  params: Promise<{ panel: string }>;
}) {
  const { panel } = await params;
  if (!POPOUT_PANELS.includes(panel as PopoutPanelKey)) notFound();

  const session = await getServerSession();
  if (!session?.user?.id) notFound();

  return <PopoutPanel panel={panel as PopoutPanelKey} userId={session.user.id} />;
}
