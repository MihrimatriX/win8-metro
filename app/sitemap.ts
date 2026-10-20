import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-static";

// Single-page app: the whole OS lives at "/".
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: `${SITE_URL}/`, lastModified: new Date(), changeFrequency: "monthly", priority: 1 }];
}
