// Absolute origin for canonical/OG/sitemap URLs. Set NEXT_PUBLIC_SITE_URL at build time (Docker: --build-arg).
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://win8.ahmetfuzunkaya.com").replace(/\/$/, "");

export const SITE_NAME = "Windows 8.1 · AFU";
export const SITE_DESCRIPTION =
  "Tarayıcıda çalışan Windows 8.1: Başlangıç ekranı, canlı kutucuklar, charm çubuğu, pencereli masaüstü ve çalışan uygulamalar.";
