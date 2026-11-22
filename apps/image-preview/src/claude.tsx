import type { EngineInterface as Engine, Register } from "claude-code";
import {
  MAX_DIMENSION_READ_BYTES,
  MAX_INLINE_BYTES,
  attachmentImages,
  base64ByteLength,
  imageAlt,
  imageFormat,
  isJpeg,
  pngSize,
  readJpeg,
  readPreview,
  type LocalImage,
  type Preview,
} from "./lib/images";
import { imageLinks } from "./lib/links";
import { imageGallery, kitOf } from "@agents/kit-legacy/claude/ui.tsx";

const fullSize = (viewport?: { columns: number; rows: number }) => ({
  columns: Math.max(1, Math.min(144, (viewport?.columns ?? 84) - 4)),
  rows: Math.max(1, Math.min(42, Math.floor((viewport?.rows ?? 48) * 0.6))),
});
const thumbnail = { columns: 24, rows: 6 };

function remember<T>(map: Map<string, T>, key: string, value: T, cap: number) {
  map.delete(key);
  map.set(key, value);
  if (map.size > cap) {
    const oldest = map.keys().next().value;
    if (oldest !== undefined) map.delete(oldest);
  }
}

const absolute = (cwd: string, path: string) => (path.startsWith("/") ? path : `${cwd}/${path}`);
const safeLocal = (path: string) => !/^\/(?:dev|proc|sys)(?:\/|$)/.test(path);
const inputPath = (input: unknown) => {
  const path = (input as { file_path?: unknown } | null)?.file_path;
  return typeof path === "string" ? path : undefined;
};

async function jpegToPng($: Engine, bytes: string) {
  if (!isJpeg(bytes) || base64ByteLength(bytes) > MAX_DIMENSION_READ_BYTES) return null;
  try {
    // The pipeline is fixed. Only base64 bytes, never a filename or command, enter stdin.
    const result = await $.process.run(
      [
        "sh",
        "-c",
        "base64 -d | magick -limit thread 1 -limit memory 64MiB -limit map 64MiB -limit disk 0 jpeg:- -auto-orient -thumbnail '640x640>' -strip inline:png:-",
      ],
      { stdin: bytes, timeoutMs: 2000 },
    );
    const png = result.stdout
      .trim()
      .match(/^data:image\/png;base64,([\s\S]+)$/)?.[1]
      ?.replace(/\s/g, "");
    return result.exitCode === 0 &&
      !result.isStdoutTruncated &&
      png &&
      base64ByteLength(png) <= MAX_INLINE_BYTES &&
      pngSize(png)
      ? png
      : null;
  } catch {
    return null;
  }
}

type PreviewCache = Map<string, Promise<Preview | null>>;

async function pathFor($: Engine, path?: string) {
  if (!path) return undefined;
  return path.startsWith("/") ? path : absolute(await $.session.cwd(), path);
}

async function fromRead(
  $: Engine,
  output: unknown,
  path: string | undefined,
  key: string,
  readJpegCache: PreviewCache,
) {
  const png = readPreview(output, path, key);
  if (png) return png;
  const jpeg = readJpeg(output);
  if (!jpeg) return null;
  const cached = readJpegCache.get(key);
  if (cached) return cached;
  const pending = jpegToPng($, jpeg).then((png): Preview | null =>
    png
      ? {
          key,
          source: { png },
          size: pngSize(png),
          alt: imageAlt(path ?? "image.jpg"),
          path,
        }
      : null,
  );
  remember(readJpegCache, key, pending, 16);
  return pending;
}

async function loadLocal(
  $: Engine,
  image: LocalImage,
  localCache: PreviewCache,
): Promise<Preview | null> {
  try {
    const stat = await $.fs.stat(image.path, { resolve: true });
    const file = stat.realPath;
    if (stat.kind !== "file" || !file || !safeLocal(file)) return null;
    const generation = image.generation ?? Math.floor(stat.mtimeMs);
    const key = `${image.format}:${file}:${stat.size}:${stat.mtimeMs}:${generation}`;
    let pending = localCache.get(key);
    if (!pending) {
      pending = (async (): Promise<Preview | null> => {
        const preview = { key, alt: imageAlt(image.path) };
        if (image.format === "png" && stat.size > MAX_DIMENSION_READ_BYTES) {
          return {
            ...preview,
            size: image.size ?? null,
            source: { file, format: "png", generation },
          };
        }
        if (stat.size <= 0 || stat.size > MAX_DIMENSION_READ_BYTES) return null;
        const { base64 } = await $.fs.read(file, { as: "bytes" });
        if (image.format === "png") {
          const size = pngSize(base64);
          if (!size) return null;
          return { ...preview, size, source: { file, format: "png", generation } };
        }
        const png = await jpegToPng($, base64);
        return png ? { ...preview, size: pngSize(png), source: { png } } : null;
      })().catch(() => null);
      remember(localCache, key, pending, 16);
    }
    const preview = await pending;
    if (!preview && localCache.get(key) === pending) localCache.delete(key);
    return preview ? { ...preview, alt: imageAlt(image.path), path: image.path } : null;
  } catch {
    return null;
  }
}

export const register: Register = (on) => {
  const readPaths = new Map<string, string>();
  const placed = new Map<string, Preview>();
  const localCache = new Map() as PreviewCache;
  const readJpegCache = new Map() as PreviewCache;

  on("tool.call", { tool: "Read" }, async ($, e, next) => {
    const path = await pathFor($, e.file_path);
    if (path) remember(readPaths, e.tool_use_id, path, 500);
    const result = await next(e);
    if (
      !result.isError &&
      readJpeg(result.result) &&
      (await $.session.surfaces()).includes("terminal")
    ) {
      await fromRead($, result.result, path, e.tool_use_id, readJpegCache);
    }
    return result;
  }).catch(($, e, next) => next(e));

  on("ui.render", { component: "ToolGroup" }, async ($, e, next) => {
    if (e.surface !== "terminal" || e.props.isExpanded) return next(e);
    let first: Preview | null = null;
    let count = 0;
    for (const [index, call] of e.props.calls.entries()) {
      if (call.tool !== "Read" || call.isRunning || call.isErrored || call.isInterrupted) continue;
      const key = call.tool_use_id ?? `${e.requestId}:${index}`;
      const path = readPaths.get(key) ?? (await pathFor($, inputPath(call.input)));
      if (!first) {
        first = await fromRead($, call.output, path, key, readJpegCache);
        if (first) count++;
      } else if (readPreview(call.output, path, key) || readJpeg(call.output)) {
        count++;
      }
    }
    const native = await next(e);
    if (!first) return native;
    const els = $.ui.resolve(e);
    const { Box, Text } = els;
    return (
      <Box flexDirection="column">
        {native}
        <Box flexDirection="column" marginLeft={2}>
          {imageGallery(kitOf(els, e), [{ ...first, path: undefined }], {
            ...thumbnail,
            columns: Math.min(thumbnail.columns, fullSize(e.viewport).columns),
          })}
          {count > 1 ? <Text dimColor>{`+${count - 1} more`}</Text> : null}
        </Box>
      </Box>
    );
  });

  on("ui.render", { component: "ToolResult" }, async ($, e, next) => {
    if (e.surface !== "terminal" || e.props.isErrored) return next(e);
    const els = $.ui.resolve(e);
    const kit = kitOf(els, e);
    if (e.props.tool === "Read") {
      const key = e.props.tool_use_id;
      const image = await fromRead($, e.props.output, readPaths.get(key), key, readJpegCache);
      return image ? imageGallery(kit, [image], fullSize(e.viewport)) : next(e);
    }
    if (e.props.tool !== "SendUserFile") return next(e);
    const native = await next(e);
    const images: Preview[] = [];
    for (const [index, image] of attachmentImages(e.props.output).entries()) {
      const preview = await loadLocal($, image, localCache);
      if (preview) images.push({ ...preview, key: `${index}:${preview.key}`, path: undefined });
    }
    return images.length ? (
      <els.Box flexDirection="column" rowGap={1}>
        {native}
        {imageGallery(kit, images, fullSize(e.viewport))}
      </els.Box>
    ) : (
      native
    );
  });

  on("turn.complete", async ($, e, next) => {
    if (e.agentId || e.reason !== "answer" || !e.answer.includes("](")) return next(e);
    if (!(await $.session.surfaces()).includes("terminal")) return next(e);
    let attempts = 0;
    const cwd = await $.session.cwd();
    for (const path of imageLinks(e.answer)) {
      if (++attempts > 8) break;
      const format = imageFormat(path);
      if (!format) continue;
      const image = await loadLocal($, { path: absolute(cwd, path), format }, localCache);
      if (!image) continue;
      const id = `reply-${e.turnId}`;
      remember(placed, id, image, 32);
      await $.ui.place({ id });
      break;
    }
    return next(e);
  }).catch(($, e, next) => next(e));

  on("ui.render", { component: "Placed" }, ($, e, next) => {
    if (e.surface !== "terminal" || e.props.plugin !== "image-preview") return next(e);
    const image = placed.get(e.props.id);
    return image ? imageGallery(kitOf($.ui.resolve(e), e), [image], fullSize(e.viewport)) : next(e);
  });
};
