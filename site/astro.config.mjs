// @ts-check
import { cpSync, createReadStream, existsSync, rmSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, fontProviders } from "astro/config";

// AGENTS_ROOT points the pages at another copy of the repo's content, such as a fixture with media.
const repoRoot = process.env.AGENTS_ROOT || fileURLToPath(new URL("..", import.meta.url));
const media = join(repoRoot, "site/media");
const base = "/agents";
const fonts = "./src/assets/fonts";
const serif = "./node_modules/@fontsource-variable/source-serif-4/files";

const types = /** @type {Record<string, string>} */ ({
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".webp": "image/webp",
  ".json": "application/json",
});

/**
 * Serves `site/media/` at `<base>/media/`: copied into the build, and read in place by the dev
 * server (with byte ranges, which a video needs to seek). Media paths in the content are
 * repo-relative (`site/media/<plugin>/demo.mp4`), so the URL is the path past `site/`.
 * @returns {import('astro').AstroIntegration}
 */
function mediaDir() {
  return {
    name: "agents:media",
    hooks: {
      "astro:server:setup": ({ server }) => {
        server.middlewares.use((req, res, next) => {
          const url = decodeURIComponent((req.url ?? "").split("?")[0] ?? "");
          if (!url.startsWith(`${base}/media/`)) return next();
          const file = normalize(join(media, url.slice(`${base}/media/`.length)));
          if (!file.startsWith(media) || !existsSync(file) || !statSync(file).isFile())
            return next();
          const size = statSync(file).size;
          const type = types[extname(file)] ?? "application/octet-stream";
          const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? "");
          if (range) {
            const start = range[1] ? Number(range[1]) : 0;
            const end = range[2] ? Number(range[2]) : size - 1;
            res.writeHead(206, {
              "Content-Type": type,
              "Content-Range": `bytes ${start}-${end}/${size}`,
              "Content-Length": end - start + 1,
              "Accept-Ranges": "bytes",
            });
            createReadStream(file, { start, end }).pipe(res);
          } else {
            res.writeHead(200, {
              "Content-Type": type,
              "Content-Length": size,
              "Accept-Ranges": "bytes",
            });
            createReadStream(file).pipe(res);
          }
        });
      },
      "astro:build:done": ({ dir }) => {
        const out = fileURLToPath(new URL("media/", dir));
        rmSync(out, { recursive: true, force: true });
        if (existsSync(media))
          cpSync(media, out, { recursive: true, filter: (f) => !f.endsWith(".json") });
      },
    },
  };
}

// https://docs.astro.build/en/reference/configuration-reference/
export default defineConfig({
  site: "https://nickolaj-jepsen.github.io",
  base,
  // GitHub Pages serves a folder's index.html at the folder's URL with its slash.
  trailingSlash: "always",
  build: { format: "directory" },
  devToolbar: { enabled: false },
  integrations: [mediaDir()],
  fonts: [
    {
      provider: fontProviders.local(),
      name: "Source Serif 4",
      cssVariable: "--serif",
      fallbacks: ["Georgia", "serif"],
      display: "swap",
      options: {
        variants: [
          {
            src: [`${serif}/source-serif-4-latin-opsz-normal.woff2`],
            weight: "200 900",
            style: "normal",
          },
          {
            src: [`${serif}/source-serif-4-latin-opsz-italic.woff2`],
            weight: "200 900",
            style: "italic",
          },
        ],
      },
    },
    {
      provider: fontProviders.local(),
      name: "Hack",
      cssVariable: "--mono",
      fallbacks: ["ui-monospace", "DejaVu Sans Mono", "Menlo", "monospace"],
      display: "swap",
      options: {
        variants: [
          { src: [`${fonts}/hack-regular.woff2`], weight: "400", style: "normal" },
          { src: [`${fonts}/hack-bold.woff2`], weight: "700", style: "normal" },
        ],
      },
    },
  ],
  vite: {
    define: { __REPO_ROOT__: JSON.stringify(repoRoot) },
  },
});
