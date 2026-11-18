import type { Register } from "claude-code";
import {
  MAX_DIMENSION_READ_BYTES,
  attachmentPreviews,
  pngSize,
  readPreview,
  type Preview,
  type Size,
} from "../core/images";
import { imageGallery, kitOf } from "./ui";

const MAX_COLUMNS = 80;
const MAX_ROWS = 30;
const READ_MAX_COLUMNS = 40;
const READ_MAX_ROWS = 15;
const READ_PATHS_LIMIT = 200;
const DIMENSION_CACHE_LIMIT = 64;
const MARGIN = 4;

const availableColumns = (cap: number, viewport: number | undefined) =>
  Math.max(1, Math.min(cap, (viewport ?? cap + MARGIN) - MARGIN));

export const register: Register = (on) => {
  const readPaths = new Map<string, string>();
  const dimensions = new Map<string, Size>();

  const rememberPath = (id: string, path: string) => {
    readPaths.delete(id);
    readPaths.set(id, path);
    if (readPaths.size > READ_PATHS_LIMIT) {
      const oldest = readPaths.keys().next().value;
      if (oldest !== undefined) readPaths.delete(oldest);
    }
  };

  const rememberSize = (key: string, value: Size) => {
    dimensions.delete(key);
    dimensions.set(key, value);
    if (dimensions.size > DIMENSION_CACHE_LIMIT) {
      const oldest = dimensions.keys().next().value;
      if (oldest !== undefined) dimensions.delete(oldest);
    }
  };

  on("tool.call", { tool: "Read" }, ($, e, next) => {
    rememberPath(e.tool_use_id, e.file_path);
    return next(e);
  }).catch(($, e, next) => next(e));

  on("ui.render", { component: "ToolGroup" }, async ($, e, next) => {
    if (e.surface !== "terminal" || e.props.isExpanded) return next(e);
    const images = e.props.calls.flatMap((call, index) => {
      if (call.tool !== "Read" || call.isRunning || call.isErrored || call.isInterrupted) return [];
      const input = call.input as { file_path?: unknown } | undefined;
      const path = typeof input?.file_path === "string" ? input.file_path : undefined;
      const image = readPreview(call.output, path, call.tool_use_id ?? `read-${index}`);
      return image ? [image] : [];
    });
    if (images.length === 0) return next(e);

    const line = await next(e);
    const els = $.ui.resolve(e);
    const { Box } = els;
    const gallery = imageGallery(kitOf(els, e.surface), images, {
      columns: availableColumns(READ_MAX_COLUMNS, e.viewport?.columns),
      rows: READ_MAX_ROWS,
    });
    return (
      <Box flexDirection="column" rowGap={1}>
        {line}
        <Box marginLeft={2}>{gallery}</Box>
      </Box>
    );
  });

  on("ui.render", { component: "ToolResult" }, async ($, e, next) => {
    if (e.surface !== "terminal" || e.props.tool !== "Read" || e.props.isErrored) return next(e);
    const image = readPreview(
      e.props.output,
      readPaths.get(e.props.tool_use_id),
      e.props.tool_use_id,
    );
    if (!image) return next(e);

    const els = $.ui.resolve(e);
    const { Box } = els;
    return (
      <Box flexDirection="column" marginBottom={1}>
        {imageGallery(kitOf(els, e.surface), [image], {
          columns: availableColumns(READ_MAX_COLUMNS, e.viewport?.columns),
          rows: READ_MAX_ROWS,
        })}
      </Box>
    );
  });

  on("ui.render", { component: "ToolResult" }, async ($, e, next) => {
    if (e.surface !== "terminal" || e.props.tool !== "SendUserFile" || e.props.isErrored)
      return next(e);
    const result = attachmentPreviews(e.props.output);
    if (!result) return next(e);

    await Promise.all(
      result.images.map(async (image: Preview) => {
        if (image.size || !("file" in image.source)) return;
        const { file, generation } = image.source;
        const key = `${file}:${generation ?? "unknown"}`;
        const cached = dimensions.get(key);
        if (cached) {
          image.size = cached;
          return;
        }
        if (typeof generation !== "number" || generation > MAX_DIMENSION_READ_BYTES) return;
        try {
          const { base64 } = await $.fs.read(file, { as: "bytes" });
          image.size = pngSize(base64);
          if (image.size) rememberSize(key, image.size);
        } catch {
          // A later redraw may find the file readable; never memoise a failure.
        }
      }),
    );

    const els = $.ui.resolve(e);
    const { Box, Text } = els;
    return (
      <Box flexDirection="column" rowGap={1} marginTop={1} marginBottom={1}>
        {imageGallery(kitOf(els, e.surface), result.images, {
          columns: availableColumns(MAX_COLUMNS, e.viewport?.columns),
          rows: MAX_ROWS,
          caption: result.caption,
        })}
        {result.others.map((path, index) => (
          <Text key={`${index}:${path}`} dimColor wrap="wrap">
            {path}
          </Text>
        ))}
      </Box>
    );
  });
};
