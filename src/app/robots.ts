import type { MetadataRoute } from "next";

const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://association.example";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard", "/train", "/admin", "/api", "/login", "/register", "/forgot-password", "/reset-password", "/verify-email"],
    },
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
