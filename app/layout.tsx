import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import { ThemeProvider } from "@/components/theme/theme-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Display-only pixel font, opt-in via the `font-pixel` utility. preload:false
// keeps it off the critical path for pages that don't use it.
const geistPixel = localFont({
  src: "./fonts/GeistPixel-Triangle.ttf",
  variable: "--font-geist-pixel",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: {
    default: "Watchparty",
    template: "%s / Watchparty",
  },
  description: "Magic internet money meets streaming",
};

// Paints the mobile browser chrome (address bar) to match the black app
// instead of Favycon's default white.
export const viewport: Viewport = {
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      // Bake the dark default into the server-rendered <html>: next-themes only
      // sets the class client-side, so without this the first paint is the
      // browser's white canvas + light `:root` before the script swaps in dark
      // (the flash on refresh). `colorScheme: dark` makes the browser paint a
      // dark canvas from byte zero; the `dark` class starts the CSS vars dark.
      // next-themes still owns it at runtime and flips it only for users who
      // picked Light/System-light (suppressHydrationWarning covers that swap).
      style={{ colorScheme: "dark" }}
      className={`dark ${geistSans.variable} ${geistMono.variable} ${geistPixel.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/*
          Shim for esbuild's keepNames helper, and it has to come BEFORE
          ThemeProvider.

          next-themes builds its pre-paint script by stringifying a function into
          an inline <script>. The Cloudflare/OpenNext build runs the server bundle
          through esbuild with keepNames, which wraps inner functions as
          `__name(fn, "fn")` — and that wrapper travels INSIDE the stringified
          source into the HTML, where the browser has no `__name`. Result in
          production (verified in the served markup): `ReferenceError: Can't find
          variable: __name`, thrown before the script reaches its own
          `k2(theme)` call, so the theme is never applied pre-paint.

          Defining it as identity makes the injected wrapper a no-op. It can't be
          fixed further up: defineCloudflareConfig exposes no esbuild options, and
          next-themes has no way to opt out of the inline script.

          next/script, NOT a raw <script>. A plain inline <script> here was
          silently DROPPED from the SSR output by React 19 (verified against the
          deployed HTML — the tag was absent while next-themes' script, and its
          __name call, were still there). `beforeInteractive` is injected into the
          initial HTML and runs before any Next module, and per the Next docs it
          has to live in the root layout, which is where it already needed to be.
          Inline content requires an `id` for Next to track it.
        */}
        <Script id="esbuild-keepnames-shim" strategy="beforeInteractive">
          {`window.__name||(window.__name=function(f){return f})`}
        </Script>
        {/*
          ThemeProvider lives at the root (not in (app)/AppProviders) so
          next-themes' own pre-paint script renders synchronously here, before
          any async boundary. Previously it sat behind (app)/layout's
          `await getServerSession()`, so on a cold load the <html> painted the
          light `:root` background while the session resolved, then flipped to
          dark — the flash, amplified on Cloudflare by edge→DB latency.
          next-themes is ~2KB with no network calls, so it doesn't pull the
          wallet/query/data SDKs the speed rule guards against into marketing/
          login. defaultTheme="dark" makes dark the default; Light/System stay
          selectable via the theme switcher.
        */}
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
