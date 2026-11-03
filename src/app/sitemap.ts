import type { MetadataRoute } from "next";

const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://association.example";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["", "/method", "/science", "/demo", "/pricing", "/privacy", "/terms", "/offer"];
  return routes.map((route) => ({
    url: `${base}${route}`,
    changeFrequency: route === "" ? "weekly" : "monthly",
    priority: route === "" ? 1 : route === "/pricing" ? 0.8 : 0.6,
  }));
}
