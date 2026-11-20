export const MAX_INLINE_BYTES = 2 * 1024 * 1024;
export const MAX_DIMENSION_READ_BYTES = 4 * 1024 * 1024;

export type Size = { width: number; height: number };
export type ImageSource = { png: string } | { file: string; format: "png"; generation?: number };
export type Preview = {
  key: string;
  source: ImageSource;
  size: Size | null;
  alt: string;
  path?: string;
};

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Decodes only enough of a PNG to validate its signature and read its IHDR dimensions. */
const header = (base64: string): Uint8Array => {
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of base64.slice(0, 44)) {
    const value = ALPHABET.indexOf(char);
    if (value < 0) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return new Uint8Array(bytes);
};

const hasSignature = (bytes: Uint8Array) =>
  SIGNATURE.every((value, index) => bytes[index] === value);

const size = (width: unknown, height: unknown): Size | null =>
  typeof width === "number" &&
  typeof height === "number" &&
  Number.isFinite(width) &&
  Number.isFinite(height) &&
  width > 0 &&
  height > 0
    ? { width, height }
    : null;

/** Returns the dimensions in a PNG header, or null for another format or a malformed header. */
export const pngSize = (base64: string): Size | null => {
  const bytes = header(base64);
  if (bytes.length < 24 || !hasSignature(bytes)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(8) !== 13) return null;
  if (String.fromCharCode(...bytes.slice(12, 16)) !== "IHDR") return null;
  return size(view.getUint32(16), view.getUint32(20));
};

/** The decoded byte count of standard padded or unpadded base64, without allocating its bytes. */
export const base64ByteLength = (base64: string): number => {
  const clean = base64.replace(/\s/g, "");
  const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((clean.length * 3) / 4) - padding);
};

export const imageAlt = (path?: string) => `[image] ${path?.split("/").pop() || "image"}`;

export const isJpeg = (base64: string) => {
  const bytes = header(base64);
  return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
};

export const readJpeg = (output: unknown): string | null => {
  const read = output as ReadOutput | null;
  const file = read?.file;
  return read?.type === "image" &&
    file?.type === "image/jpeg" &&
    typeof file.base64 === "string" &&
    isJpeg(file.base64)
    ? file.base64
    : null;
};

type ReadOutput = {
  type?: unknown;
  file?: {
    type?: unknown;
    base64?: unknown;
    originalSize?: unknown;
    dimensions?: {
      originalWidth?: unknown;
      originalHeight?: unknown;
      displayWidth?: unknown;
      displayHeight?: unknown;
    };
  };
};

/**
 * Extracts a drawable PNG from a Read result. Large results use their absolute source path when
 * one is available, since Image's inline source is capped at 2 MiB.
 */
export const readPreview = (output: unknown, path?: string, key?: string): Preview | null => {
  const read = output as ReadOutput | null;
  const file = read?.file;
  if (read?.type !== "image" || file?.type !== "image/png" || typeof file.base64 !== "string")
    return null;

  const bytes = header(file.base64);
  if (!hasSignature(bytes)) return null;
  const dimensions = file.dimensions;
  const dimensionsSize =
    size(dimensions?.originalWidth, dimensions?.originalHeight) ??
    size(dimensions?.displayWidth, dimensions?.displayHeight);
  const imageSize = pngSize(file.base64) ?? dimensionsSize;
  if (!imageSize) return null;

  const canReadFile = path?.startsWith("/") === true;
  const source: ImageSource | null =
    base64ByteLength(file.base64) <= MAX_INLINE_BYTES
      ? { png: file.base64 }
      : canReadFile && typeof file.originalSize === "number"
        ? { file: path, format: "png", generation: file.originalSize }
        : null;
  if (!source) return null;

  return {
    key: key ?? path ?? file.base64.slice(0, 44),
    source,
    size: imageSize,
    alt: imageAlt(path ?? "image.png"),
    ...(path && canReadFile ? { path } : {}),
  };
};

type Attachment = {
  path?: unknown;
  size?: unknown;
  isImage?: unknown;
  media_type?: unknown;
  file_uuid?: unknown;
  pathValidated?: unknown;
  upload_error?: unknown;
  partial_error?: unknown;
  scaled?: {
    original_width?: unknown;
    original_height?: unknown;
  };
};

type SendOutput = { display?: unknown; attachments?: unknown };
export type LocalImage = {
  path: string;
  format: "png" | "jpeg";
  size?: Size | null;
  generation?: number;
};

export const imageFormat = (path: string) =>
  /\.png$/i.test(path) ? "png" : /\.jpe?g$/i.test(path) ? "jpeg" : null;

/** Select previews only; Claude still draws every attachment and the caption. */
export const attachmentImages = (output: unknown): LocalImage[] => {
  const send = output as SendOutput | null;
  if (send?.display === "attach" || !Array.isArray(send?.attachments)) return [];
  return send.attachments.flatMap((file: Attachment | null) => {
    if (
      !file ||
      file.isImage !== true ||
      typeof file.path !== "string" ||
      !file.path.startsWith("/") ||
      file.pathValidated === false ||
      file.upload_error ||
      file.partial_error
    )
      return [];
    const format =
      file.media_type === "image/png"
        ? "png"
        : file.media_type === "image/jpeg"
          ? "jpeg"
          : file.media_type == null
            ? imageFormat(file.path)
            : null;
    if (!format) return [];
    let generation: number | undefined;
    if (typeof file.file_uuid === "string" && file.file_uuid) {
      let hash = 0x811c9dc5;
      for (const char of file.file_uuid) hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193);
      generation = hash >>> 0;
    }
    return [
      {
        path: file.path,
        format,
        generation,
        size: size(file.scaled?.original_width, file.scaled?.original_height),
      },
    ];
  });
};
