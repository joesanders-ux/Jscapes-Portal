/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // Server actions default to a 1 MB request limit. PDFs can be up to 50 MB, a job-image upload
    // can carry several photos at once (45 MB in total) and an equipment form can carry several manuals plus pictures
    // (100 MB in total), so allow 110 MB per request.
    serverActions: { bodySizeLimit: "110mb" },
    // sharp is a native module (used to make image thumbnails): keep it out of the bundle.
    serverComponentsExternalPackages: ["sharp"],
  },
};
export default nextConfig;
