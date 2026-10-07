/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" }
    ]
  },
  experimental: {
    optimizePackageImports: ["nostr-tools"]
  }
};

export default nextConfig;
