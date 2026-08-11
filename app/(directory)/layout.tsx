// Public app-directory shell. Its own group (not (marketing)) because the
// marketing layout bounces signed-in users to /home, and the directory must be
// reachable by everyone — signed-in users are exactly the people who will
// authorize an app. Deliberately provider-free (speed rule): plain server
// pages, no wallet/query providers.
export default function DirectoryLayout({ children }: { children: React.ReactNode }) {
    return <div className="flex min-h-dvh flex-col bg-white text-black">{children}</div>;
}
