import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://beacontry.com"),
  title: {
    default: "Beacontry — Open-source trading intelligence with a public audit trail",
    template: "%s · Beacontry",
  },
  description:
    "Hybrid signal engine, manual order ticket, tax tooling, and journaled trades on your own brokerage. Every signal shows its math. Source-available under FSL-1.1-ALv2.",
  keywords: [
    "open source trading platform",
    "algorithmic trading",
    "Alpaca",
    "IBKR",
    "Tradier",
    "trading bot",
    "stock screener",
    "trade journal",
    "wash sale tracker",
    "MTM 475(f)",
    "audit log trading",
    "self-hosted trading platform",
  ],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Beacontry",
  },
  openGraph: {
    type: "website",
    url: "https://beacontry.com",
    siteName: "Beacontry",
    title: "Beacontry — Open-source trading intelligence with a public audit trail",
    description:
      "Hybrid signal engine, manual order ticket, tax tooling, and journaled trades on your own brokerage. Every signal shows its math.",
    images: [
      {
        url: "/og-card.png",
        width: 1200,
        height: 630,
        alt: "Beacontry — trading intelligence platform",
      },
    ],
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Beacontry — Open-source trading intelligence",
    description:
      "Hybrid signal engine + manual order ticket + tax tooling on your own brokerage. Every signal shows its math.",
    images: ["/og-card.png"],
  },
  alternates: { canonical: "https://beacontry.com" },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#0d1511" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        {/* Blocking on purpose: applies the theme class BEFORE first paint
            (dark by default, stored choice wins) — see /public/theme-init.js.
            suppressHydrationWarning on <html> because this script mutates
            the class list pre-hydration. */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="/theme-init.js" />
        {/* SW registration extracted to /public/sw-register.js so CSP
            can drop script-src 'unsafe-inline'. */}
        <script src="/sw-register.js" defer />
      </head>
      <body className="min-h-screen bg-bg-primary text-text-primary antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
