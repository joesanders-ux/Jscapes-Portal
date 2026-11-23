/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Server actions default to a 1 MB request limit, too small for PDF uploads (15 MB file limit + form overhead).
  experimental: { serverActions: { bodySizeLimit: "16mb" } },
};
export default nextConfig;
