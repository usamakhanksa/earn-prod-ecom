/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Lint runs centrally (`pnpm lint`) and CI enforces it; keep the build fast.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;