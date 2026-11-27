import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.APP_URL ?? "https://app.amlsync.com";
  return ["/", "/product", "/amlr-guide", "/pricing", "/contact", "/security", "/subprocessors", "/signup", "/login"].map((p) => ({ url: base + p, changeFrequency: "monthly" as const, priority: p === "/" ? 1 : p === "/pricing" || p === "/amlr-guide" || p === "/product" ? 0.8 : 0.5 }));
}
