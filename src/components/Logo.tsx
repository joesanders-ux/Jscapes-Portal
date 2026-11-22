import Image from "next/image";

// Transparent logo (public/logo.png) works on both the dark header and light pages.
export function Logo({ height = 36 }: { height?: number }) {
  const width = Math.round(height * (1400 / 315));
  return <Image src="/logo.png" alt="J-Scapes Gardening and Landscaping" width={width} height={height} priority />;
}
