import type { NextConfig } from "next";

// Static security headers (spec §8C.6, §8C.8). The Content-Security-Policy
// with a per-request nonce is set in src/middleware.ts.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["@node-rs/argon2", "pdf-lib", "@pdf-lib/fontkit"],
  outputFileTracingIncludes: { "/**": ["./node_modules/dejavu-fonts-ttf/ttf/DejaVuSans*.ttf"] },
  experimental: { serverActions: { bodySizeLimit: "10mb" } }, // screening-list uploads
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
