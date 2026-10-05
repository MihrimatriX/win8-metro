import type { Metadata, Viewport } from "next";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_NAME,
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: "Ahmet Faruk Uzunkaya", url: "https://github.com/MihrimatriX" }],
  keywords: ["Windows 8.1", "Metro UI", "Windows 8 web", "React", "Next.js", "portfolyo", "Ahmet Faruk Uzunkaya"],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    locale: "tr_TR",
    alternateLocale: "en_US",
  },
  twitter: { card: "summary_large_image", title: SITE_NAME, description: SITE_DESCRIPTION },
};

// schema.org data for rich results; the whole site is one browser app.
const JSON_LD = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: SITE_NAME,
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  applicationCategory: "EntertainmentApplication",
  operatingSystem: "Web",
  inLanguage: "tr",
  offers: { "@type": "Offer", price: "0", priceCurrency: "TRY" },
  author: { "@type": "Person", name: "Ahmet Faruk Uzunkaya", url: "https://github.com/MihrimatriX" },
});

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
        <link rel="stylesheet" href={FONTS} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON_LD }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
