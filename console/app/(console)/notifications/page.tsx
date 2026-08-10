import { EmptyView } from "@/components/console/empty-view";
import { Notification03Icon } from "@hugeicons/core-free-icons";

export default function NotificationsPage() {
  return (
    <EmptyView
      title="Notifications"
      tagline="Important updates about the watchparty developer platform."
      icon={Notification03Icon}
      emptyLine="No announcements yet — platform news that affects your integrations will appear here."
    />
  );
}
