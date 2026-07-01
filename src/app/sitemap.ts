import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = SITE_URL;
  const lastModified = new Date();
  return [
    { url: `${base}/`, lastModified, priority: 1.0, changeFrequency: "weekly" },
    {
      url: `${base}/privacy`,
      lastModified,
      priority: 0.3,
      changeFrequency: "yearly",
    },
    {
      url: `${base}/terms`,
      lastModified,
      priority: 0.3,
      changeFrequency: "yearly",
    },
  ];
}
