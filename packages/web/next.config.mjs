import { copyFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Workaround: Next.js 14 emits the client-reference-manifest for `app/index/page.tsx`
 * at `.next/server/app/index/index/page_client-reference-manifest.js` (double-nested
 * because `index` is a reserved path segment), but then looks for it one level up at
 * `.next/server/app/index/page_client-reference-manifest.js`. The webpack plugin below
 * copies the file to the expected location right after each emit.
 */
class FixIndexManifestPlugin {
  apply(compiler) {
    compiler.hooks.afterEmit.tap("FixIndexManifestPlugin", () => {
      const src  = join(__dirname, ".next", "server", "app", "index", "index", "page_client-reference-manifest.js");
      const dest = join(__dirname, ".next", "server", "app", "index", "page_client-reference-manifest.js");
      if (existsSync(src)) {
        copyFileSync(src, dest);
      }
    });
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@batch/core"],
  reactStrictMode: true,
  // @batch/core is raw ESM-TS: its intra-package imports use `.js` specifiers that point
  // at `.ts` files (e.g. `./types.js` -> `types.ts`), with no build step. transpilePackages
  // tells Next to COMPILE core, but webpack must also be told to RESOLVE those `.js`
  // specifiers to `.ts` sources — otherwise `next build` dies on "Can't resolve './types.js'".
  webpack: (config, { isServer }) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    config.plugins.push(new FixIndexManifestPlugin());
    return config;
  },
};
export default nextConfig;
