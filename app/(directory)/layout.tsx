// Public app-directory shell. Its own group (not (marketing)) because the
// marketing layout bounces signed-in users to /home, and the directory must be
// reachable by everyone — signed-in users are exactly the people who will
// authorize an app. Deliberately provider-free (speed rule): plain server
// pages, no wallet/query providers.
//
// MiniPlayerShell is the one exception, and it doesn't break that rule: it is a
// context plus a dynamic import that is never fetched until a video is actually
// in the player, so a visitor who has never opened one downloads nothing extra.
// It's here so a mini player opened in (app) survives the trip.
import { MiniPlayerShell } from "@/components/app-ui/mini-player-shell";

export default function DirectoryLayout({ children }: { children: React.ReactNode }) {
    return (
        <MiniPlayerShell>
            <div className="flex min-h-dvh flex-col bg-white text-black">{children}</div>
        </MiniPlayerShell>
    );
}
