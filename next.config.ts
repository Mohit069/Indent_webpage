import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /*
   * Emits .next/standalone — a self-contained server you can copy to your own
   * machine and run with `node server.js`, no node_modules install needed.
   *
   * Switched off on Vercel, which builds its own serverless output and does not
   * want a second copy of the server traced into the bundle.
   */
  output: process.env.VERCEL ? undefined : 'standalone',
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
