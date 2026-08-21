import { DevHeader, DevFooter } from "@/components/developer/dev-sections";
import { MiniPlayerShell } from "@/components/app-ui/mini-player-shell";

// Developer portal shell — a SELF-COLOURED dark surface (the X developer
// console look), unlike the light marketing shell. Deliberately not the
// marketing SiteHeader/footer: those are styled for light canvases, and this
// shell must not use theme-flipping tokens either way (CLAUDE.md black-on-black
// rule) — every colour in the (developer) tree is fixed.
//
// Also deliberately no signed-in redirect (the (marketing) layout has one):
// the console is a signed-in surface, and bouncing a logged-in developer to
// /home would make the portal unreachable for exactly the people it's for.
// MiniPlayerShell carries a mini player opened in (app) across the group
// boundary. A context plus a lazy import that stays unfetched until there is a
// video in it, so the portal's bundle is unchanged.
export default function DeveloperLayout({ children }: { children: React.ReactNode }) {
    return (
        <MiniPlayerShell>
            <div className="relative flex min-h-svh flex-col bg-[#0b0b0d] text-white">
                <DevHeader />
                <main className="flex-1">{children}</main>
                <DevFooter />
            </div>
        </MiniPlayerShell>
    );
}
