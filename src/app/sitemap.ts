import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.APP_URL ?? "https://app.amlsync.com";
  return ["/", "/pricing", "/security", "/subprocessors", "/signup", "/login"].map((p) => ({ url: base + p, changeFrequency: "monthly" as const, priority: p === "/" ? 1 : p === "/pricing" ? 0.8 : 0.5 }));
}
