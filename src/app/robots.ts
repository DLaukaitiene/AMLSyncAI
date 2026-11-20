import type { MetadataRoute } from "next";

/** Public pages may be indexed; the app, the client portal, the backoffice and APIs may not. */
export default function robots(): MetadataRoute.Robots {
  const base = process.env.APP_URL ?? "https://app.amlsync.com";
  return {
    rules: [{ userAgent: "*", allow: ["/", "/pricing", "/tools/ownership-calculator", "/security", "/subprocessors"], disallow: ["/app", "/p/", "/api/", "/adminpage1&", "/dev/", "/reauth"] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
