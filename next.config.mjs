/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // Server actions default to a 1 MB request limit. PDFs can be up to 15 MB and a job-image upload
    // can carry several photos at once (45 MB in total), so allow 50 MB per request.
    serverActions: { bodySizeLimit: "50mb" },
    // sharp is a native module (used to make image thumbnails): keep it out of the bundle.
    serverComponentsExternalPackages: ["sharp"],
  },
};
export default nextConfig;
