import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevent CDN/proxy layers from caching error responses on static assets.
  // Without this, a 403/404 served during a rolling deploy can get stuck.
  async headers() {
    return [
      {
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },
};

export default nextConfig;
