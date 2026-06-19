/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@batch/core"],
  reactStrictMode: true,
  // @batch/core is raw ESM-TS: its intra-package imports use `.js` specifiers that point
  // at `.ts` files (e.g. `./types.js` -> `types.ts`), with no build step. transpilePackages
  // tells Next to COMPILE core, but webpack must also be told to RESOLVE those `.js`
  // specifiers to `.ts` sources — otherwise `next build` dies on "Can't resolve './types.js'".
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};
export default nextConfig;
