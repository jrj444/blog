import type { MetadataRoute } from "next";
import { absUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: absUrl("/sitemap.xml"),
  };
}
