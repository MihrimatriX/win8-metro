import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AFU · Metro",
  description: "AFU'nun projelerini canlı kutucuklarla dolu bir Metro Başlangıç ekranında sergileyen portfolyo. / AFU's portfolio on a Metro-style Start screen full of live tiles.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1b0f4a",
};

const FONTS =
  "https://fonts.googleapis.com/css2?family=Open+Sans:wght@300;400;600;700&family=Bebas+Neue&family=Orbitron:wght@500;800&family=Playfair+Display:ital,wght@1,700&family=Righteous&family=Space+Grotesk:wght@500;700&display=swap";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" data-layout="tablet" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href={FONTS} />
      </head>
      <body>{children}</body>
    </html>
  );
}
