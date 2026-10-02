import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Windows 8.1 · AFU",
  description:
    "Tarayıcıda çalışan bir Windows 8.1 klonu: Başlangıç ekranı, canlı kutucuklar, charm çubuğu, gerçek pencereli masaüstü ve çalışan uygulamalar. / A Windows 8.1 clone that runs in the browser: Start screen, live tiles, charms, a real windowed desktop and working apps.",
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
