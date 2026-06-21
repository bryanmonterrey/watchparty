import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
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
      className={`${geistSans.variable} ${geistMono.variable} ${geistPixel.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
