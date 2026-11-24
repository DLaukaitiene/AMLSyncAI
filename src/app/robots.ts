import type { MetadataRoute } from "next";

/** Public pages may be indexed; the app, the client portal, the backoffice and APIs may not.
 *  SITE_NOINDEX=1 (test sites such as testapp2.amlsync.com): nothing may be indexed. */
export default function robots(): MetadataRoute.Robots {
  const base = process.env.APP_URL ?? "https://app.amlsync.com";
  if (process.env.SITE_NOINDEX === "1") return { rules: [{ userAgent: "*", disallow: ["/"] }] };
  return {
    rules: [{ userAgent: "*", allow: ["/", "/pricing", "/security", "/subprocessors"], disallow: ["/app", "/p/", "/api/", "/adminpage1&", "/dev/", "/reauth"] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
