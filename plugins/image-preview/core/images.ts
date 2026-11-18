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

const fileName = (path: string | undefined) => path?.split("/").pop() || "image.png";

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
    alt: `[image] ${fileName(path)}`,
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

type SendOutput = { caption?: unknown; display?: unknown; attachments?: unknown };
export type AttachmentPreviews = { caption?: string; images: Preview[]; others: string[] };

const attachment = (value: unknown): Attachment | null =>
  value && typeof value === "object" ? (value as Attachment) : null;

const isPng = (file: Attachment) =>
  file.isImage === true &&
  typeof file.path === "string" &&
  file.path.startsWith("/") &&
  file.pathValidated !== false &&
  (file.media_type === "image/png" || /\.png$/i.test(file.path));

/** A content token for Image; uploads have a UUID, older results only their byte size. */
const generation = (file: Attachment): number | undefined => {
  if (typeof file.file_uuid === "string" && file.file_uuid) {
    let hash = 0x811c9dc5;
    for (const char of file.file_uuid) hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193);
    return hash >>> 0;
  }
  return typeof file.size === "number" ? file.size : undefined;
};

/** Extracts safe local PNG attachments, leaving errored or attach-only results to the host. */
export const attachmentPreviews = (output: unknown): AttachmentPreviews | null => {
  const send = output as SendOutput | null;
  if (!send || send.display === "attach" || !Array.isArray(send.attachments)) return null;
  const files = send.attachments.map(attachment);
  if (files.some((file) => !file || file.upload_error || file.partial_error)) return null;
  // A mixed PNG/JPEG result stays whole, so the other image keeps the host's renderer too.
  if (files.some((file) => file!.isImage === true && !isPng(file!))) return null;

  const images = files.flatMap((file, index) => {
    if (!file || !isPng(file) || typeof file.path !== "string") return [];
    const path = file.path;
    const contentGeneration = generation(file);
    return [
      {
        key: `${index}:${path}`,
        source: {
          file: path,
          format: "png" as const,
          ...(contentGeneration !== undefined ? { generation: contentGeneration } : {}),
        },
        size: size(file.scaled?.original_width, file.scaled?.original_height),
        alt: `[image] ${fileName(path)}`,
        path,
      },
    ];
  });
  if (images.length === 0) return null;

  return {
    ...(typeof send.caption === "string" && send.caption ? { caption: send.caption } : {}),
    images,
    others: files.flatMap((file) =>
      file && !isPng(file) && typeof file.path === "string" ? [file.path] : [],
    ),
  };
};
