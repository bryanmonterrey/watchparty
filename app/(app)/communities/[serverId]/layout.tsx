// Wrapped by /communities/layout.tsx, which renders the server rail and
// sidebar columns; this just provides the content column frame.
export default function ServerLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex flex-col flex-1 h-full min-w-0">
            {children}
        </div>
    );
}
