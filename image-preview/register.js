import { a as clamp, i as blank, n as stack, o as line, r as notice, s as span, t as paintLines } from "./claude-D9ioVTBF.js";

// src/lib/images.ts
const MAX_INLINE_BYTES = 2097152;
const MAX_DIMENSION_READ_BYTES = 4194304;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const SIGNATURE = [
	137,
	80,
	78,
	71,
	13,
	10,
	26,
	10
];
/** Decodes only enough of a PNG to validate its signature and read its IHDR dimensions. */
const header = (base64) => {
	const bytes = [];
	let buffer = 0;
	let bits = 0;
	for (const char of base64.slice(0, 44)) {
		const value = ALPHABET.indexOf(char);
		if (value < 0) continue;
		buffer = buffer << 6 | value;
		bits += 6;
		if (bits >= 8) {
			bits -= 8;
			bytes.push(buffer >> bits & 255);
		}
	}
	return new Uint8Array(bytes);
};
const hasSignature = (bytes) => SIGNATURE.every((value, index) => bytes[index] === value);
const size = (width, height) => typeof width === "number" && typeof height === "number" && Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 ? {
	width,
	height
} : null;
/** Returns the dimensions in a PNG header, or null for another format or a malformed header. */
const pngSize = (base64) => {
	const bytes = header(base64);
	if (bytes.length < 24 || !hasSignature(bytes)) return null;
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (view.getUint32(8) !== 13) return null;
	if (String.fromCharCode(...bytes.slice(12, 16)) !== "IHDR") return null;
	return size(view.getUint32(16), view.getUint32(20));
};
/** The decoded byte count of standard padded or unpadded base64, without allocating its bytes. */
const base64ByteLength = (base64) => {
	const clean = base64.replace(/\s/g, "");
	const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
	return Math.max(0, Math.floor(clean.length * 3 / 4) - padding);
};
const imageAlt = (path) => `[image] ${path?.split("/").pop() || "image"}`;
const isJpeg = (base64) => {
	const bytes = header(base64);
	return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
};
const readJpeg = (output) => {
	const read = output;
	const file = read?.file;
	return read?.type === "image" && file?.type === "image/jpeg" && typeof file.base64 === "string" && isJpeg(file.base64) ? file.base64 : null;
};
/**
* Extracts a drawable PNG from a Read result. Large results use their absolute source path when
* one is available, since Image's inline source is capped at 2 MiB.
*/
const readPreview = (output, path, key) => {
	const read = output;
	const file = read?.file;
	if (read?.type !== "image" || file?.type !== "image/png" || typeof file.base64 !== "string") return null;
	const bytes = header(file.base64);
	if (!hasSignature(bytes)) return null;
	const dimensions = file.dimensions;
	const dimensionsSize = size(dimensions?.originalWidth, dimensions?.originalHeight) ?? size(dimensions?.displayWidth, dimensions?.displayHeight);
	const imageSize = pngSize(file.base64) ?? dimensionsSize;
	if (!imageSize) return null;
	const canReadFile = path?.startsWith("/") === true;
	const source = base64ByteLength(file.base64) <= 2097152 ? { png: file.base64 } : canReadFile && typeof file.originalSize === "number" ? {
		file: path,
		format: "png",
		generation: file.originalSize
	} : null;
	if (!source) return null;
	return {
		key: key ?? path ?? file.base64.slice(0, 44),
		source,
		size: imageSize,
		alt: imageAlt(path ?? "image.png"),
		...path && canReadFile ? { path } : {}
	};
};
const imageFormat = (path) => /\.png$/i.test(path) ? "png" : /\.jpe?g$/i.test(path) ? "jpeg" : null;
/** Select previews only; Claude still draws every attachment and the caption. */
const attachmentImages = (output) => {
	const send = output;
	if (send?.display === "attach" || !Array.isArray(send?.attachments)) return [];
	return send.attachments.flatMap((file) => {
		if (!file || file.isImage !== true || typeof file.path !== "string" || !file.path.startsWith("/") || file.pathValidated === false || file.upload_error || file.partial_error) return [];
		const format = file.media_type === "image/png" ? "png" : file.media_type === "image/jpeg" ? "jpeg" : file.media_type == null ? imageFormat(file.path) : null;
		if (!format) return [];
		let generation;
		if (typeof file.file_uuid === "string" && file.file_uuid) {
			let hash = 0x811c9dc5;
			for (const char of file.file_uuid) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
			generation = hash >>> 0;
		}
		return [{
			path: file.path,
			format,
			generation,
			size: size(file.scaled?.original_width, file.scaled?.original_height)
		}];
	});
};

// src/lib/links.ts
const imageExtension = /\.(png|jpe?g)$/i;
const unsafePath = /[\x00-\x1f\x7f\\]/;
/** Accept local Markdown destinations, not network URLs (including file://host). */
function localImagePath(destination) {
	if (/^file:\/\/\//i.test(destination)) destination = destination.slice(7);
	else if (/^[\w+.-]+:|^\/\//.test(destination)) return null;
	try {
		const path = decodeURIComponent(destination);
		return imageExtension.test(path) && !unsafePath.test(path) && !path.startsWith("//") && !/^[\w+.-]+:/.test(path) ? path : null;
	} catch {
		return null;
	}
}
/** Inline Markdown links and image embeds, outside code. Bare paths are not requests to draw. */
function* imageLinks(markdown) {
	let fence = "";
	const visible = [];
	for (const line of markdown.split("\n")) {
		const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
		if (fence) {
			if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2]?.trim()) fence = "";
			continue;
		}
		if (marker) {
			fence = marker[1];
			visible.push("");
		} else visible.push(/^(?: {4}|\t)/.test(line) ? "" : line);
	}
	const tokens = /\\[^\n]|(?<!`)(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)|!?\[(?:\\.|[^[\]\\\n])*\]\(\s*(?:<([^<>\n]+)>|((?:\\.|\([^()\n]*\)|[^\s()\\<>])+))(?:[ \t]+(?:"[^"\n]*"|'[^'\n]*'|\([^()\n]*\)))?\s*\)/g;
	const seen = /* @__PURE__ */ new Set();
	for (const match of visible.join("\n").matchAll(tokens)) {
		const target = match[2] ?? match[3];
		if (!target) continue;
		const path = localImagePath(target.replace(/\\([!-/:-@[-`{-~])/g, "$1"));
		if (path && !seen.has(path)) {
			seen.add(path);
			yield path;
		}
	}
}

// ../../lib/kits/image/src/terminal.ts
/**
* Images as styled lines, for the terminal only: the graphical clients show images themselves.
* An image is one line with an `image` slot, whose alt text stands in where the client cannot
* draw one (pi, a terminal without images); its path is `link` lines under it.
*/
/** Fits an image inside a terminal cell box without changing its aspect ratio. */
function fitImage(size, options) {
	const bound = (value, fallback) => Math.max(1, Math.min(255, Math.floor(Number.isFinite(value) ? value : fallback)));
	const columns = bound(options.columns, 1);
	const rows = bound(options.rows ?? 30, 30);
	const ratio = Number.isFinite(options.cellRatio) && (options.cellRatio ?? 0) > 0 ? options.cellRatio : 2;
	const image = size && Number.isFinite(size.width) && Number.isFinite(size.height) && size.width > 0 && size.height > 0 ? size : {
		width: 16,
		height: 10
	};
	const aspect = image.width / image.height;
	let fittedColumns = columns;
	let fittedRows = Math.max(1, Math.round(fittedColumns / aspect / ratio));
	if (fittedRows > rows) {
		fittedRows = rows;
		fittedColumns = Math.max(1, Math.round(fittedRows * ratio * aspect));
	}
	return {
		columns: Math.max(1, Math.min(columns, fittedColumns)),
		rows: Math.max(1, Math.min(rows, fittedRows))
	};
}
/** Encodes an absolute path as a file URL without escaping its slashes. */
const fileUrl = (path) => `file://${path.split("/").map(encodeURIComponent).join("/")}`;
/**
* Draws images at their aspect ratios, a blank row between parts, each with its path as a dim
* link below it. `columns` is the room for the lines too.
*/
function imageGallery(images, options) {
	const room = Math.max(1, Math.floor(options.columns));
	const parts = [];
	if (options.caption) parts.push(clamp(options.caption, room).map((row) => line([span(row, { role: "dim" })])));
	for (const image of images) {
		const box = fitImage(image.size, options);
		const rows = [{
			spans: [span(image.alt, { role: "dim" })],
			slot: {
				kind: "image",
				source: image.source,
				...box,
				alt: image.alt
			}
		}];
		if (image.path) {
			const href = fileUrl(image.path);
			rows.push(blank(), ...clamp(image.path, room).map((row) => ({
				spans: [span(row, { role: "dim" })],
				slot: {
					kind: "link",
					href
				}
			})));
		}
		parts.push(rows);
	}
	return parts.flatMap((part, i) => i ? [blank(), ...part] : part);
}

// src/claude.tsx
const fullSize = (viewport) => ({
	columns: Math.max(1, Math.min(144, (viewport?.columns ?? 84) - 4)),
	rows: Math.max(1, Math.min(42, Math.floor((viewport?.rows ?? 48) * .6)))
});
/** The images as the terminal draws them: the kit's lines, painted with the event's elements. */
const gallery = (els, images, options) => paintLines(els, imageGallery(images, options));
const thumbnail = {
	columns: 24,
	rows: 6
};
function remember(map, key, value, cap) {
	map.delete(key);
	map.set(key, value);
	if (map.size > cap) {
		const oldest = map.keys().next().value;
		if (oldest !== void 0) map.delete(oldest);
	}
}
const absolute = (cwd, path) => path.startsWith("/") ? path : `${cwd}/${path}`;
const safeLocal = (path) => !/^\/(?:dev|proc|sys)(?:\/|$)/.test(path);
const inputPath = (input) => {
	const path = input?.file_path;
	return typeof path === "string" ? path : void 0;
};
async function jpegToPng($, bytes) {
	if (!isJpeg(bytes) || base64ByteLength(bytes) > 4194304) return null;
	try {
		const result = await $.process.run([
			"sh",
			"-c",
			"base64 -d | magick -limit thread 1 -limit memory 64MiB -limit map 64MiB -limit disk 0 jpeg:- -auto-orient -thumbnail '640x640>' -strip inline:png:-"
		], {
			stdin: bytes,
			timeoutMs: 2e3
		});
		const png = result.stdout.trim().match(/^data:image\/png;base64,([\s\S]+)$/)?.[1]?.replace(/\s/g, "");
		return result.exitCode === 0 && !result.isStdoutTruncated && png && base64ByteLength(png) <= 2097152 && pngSize(png) ? png : null;
	} catch {
		return null;
	}
}
async function pathFor($, path) {
	if (!path) return void 0;
	return path.startsWith("/") ? path : absolute(await $.session.cwd(), path);
}
async function fromRead($, output, path, key, readJpegCache) {
	const png = readPreview(output, path, key);
	if (png) return png;
	const jpeg = readJpeg(output);
	if (!jpeg) return null;
	const cached = readJpegCache.get(key);
	if (cached) return cached;
	const pending = jpegToPng($, jpeg).then((png) => png ? {
		key,
		source: { png },
		size: pngSize(png),
		alt: imageAlt(path ?? "image.jpg"),
		path
	} : null);
	remember(readJpegCache, key, pending, 16);
	return pending;
}
async function loadLocal($, image, localCache) {
	try {
		const stat = await $.fs.stat(image.path, { resolve: true });
		const file = stat.realPath;
		if (stat.kind !== "file" || !file || !safeLocal(file)) return null;
		const generation = image.generation ?? Math.floor(stat.mtimeMs);
		const key = `${image.format}:${file}:${stat.size}:${stat.mtimeMs}:${generation}`;
		let pending = localCache.get(key);
		if (!pending) {
			pending = (async () => {
				const preview = {
					key,
					alt: imageAlt(image.path)
				};
				if (image.format === "png" && stat.size > 4194304) return {
					...preview,
					size: image.size ?? null,
					source: {
						file,
						format: "png",
						generation
					}
				};
				if (stat.size <= 0 || stat.size > 4194304) return null;
				const { base64 } = await $.fs.read(file, { as: "bytes" });
				if (image.format === "png") {
					const size = pngSize(base64);
					if (!size) return null;
					return {
						...preview,
						size,
						source: {
							file,
							format: "png",
							generation
						}
					};
				}
				const png = await jpegToPng($, base64);
				return png ? {
					...preview,
					size: pngSize(png),
					source: { png }
				} : null;
			})().catch(() => null);
			remember(localCache, key, pending, 16);
		}
		const preview = await pending;
		if (!preview && localCache.get(key) === pending) localCache.delete(key);
		return preview ? {
			...preview,
			alt: imageAlt(image.path),
			path: image.path
		} : null;
	} catch {
		return null;
	}
}
const register = (on) => {
	const readPaths = /* @__PURE__ */ new Map();
	const placed = /* @__PURE__ */ new Map();
	const localCache = /* @__PURE__ */ new Map();
	const readJpegCache = /* @__PURE__ */ new Map();
	on("tool.call", { tool: "Read" }, async ($, e, next) => {
		const path = await pathFor($, e.file_path);
		if (path) remember(readPaths, e.tool_use_id, path, 500);
		const result = await next(e);
		if (!result.isError && readJpeg(result.result) && (await $.session.surfaces()).includes("terminal")) await fromRead($, result.result, path, e.tool_use_id, readJpegCache);
		return result;
	}).catch(($, e, next) => next(e));
	on("ui.render", { component: "ToolGroup" }, async ($, e, next) => {
		if (e.surface !== "terminal" || e.props.isExpanded) return next(e);
		let first = null;
		let count = 0;
		for (const [index, call] of e.props.calls.entries()) {
			if (call.tool !== "Read" || call.isRunning || call.isErrored || call.isInterrupted) continue;
			const key = call.tool_use_id ?? `${e.requestId}:${index}`;
			const path = readPaths.get(key) ?? await pathFor($, inputPath(call.input));
			if (!first) {
				first = await fromRead($, call.output, path, key, readJpegCache);
				if (first) count++;
			} else if (readPreview(call.output, path, key) || readJpeg(call.output)) count++;
		}
		const native = await next(e);
		if (!first) return native;
		const els = $.ui.resolve(e);
		const columns = Math.min(thumbnail.columns, fullSize(e.viewport).columns);
		const lines = [...imageGallery([{
			...first,
			path: void 0
		}], {
			...thumbnail,
			columns
		}), ...count > 1 ? notice(`+${count - 1} more`, columns, "dim") : []];
		return stack(els, native, paintLines(els, lines, { indent: 2 }));
	});
	on("ui.render", { component: "ToolResult" }, async ($, e, next) => {
		if (e.surface !== "terminal" || e.props.isErrored) return next(e);
		const els = $.ui.resolve(e);
		if (e.props.tool === "Read") {
			const key = e.props.tool_use_id;
			const image = await fromRead($, e.props.output, readPaths.get(key), key, readJpegCache);
			return image ? gallery(els, [image], fullSize(e.viewport)) : next(e);
		}
		if (e.props.tool !== "SendUserFile") return next(e);
		const native = await next(e);
		const images = [];
		for (const [index, image] of attachmentImages(e.props.output).entries()) {
			const preview = await loadLocal($, image, localCache);
			if (preview) images.push({
				...preview,
				key: `${index}:${preview.key}`,
				path: void 0
			});
		}
		return images.length ? stack(els, native, paintLines(els, [blank(), ...imageGallery(images, fullSize(e.viewport))])) : native;
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
			const image = await loadLocal($, {
				path: absolute(cwd, path),
				format
			}, localCache);
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
		return image ? gallery($.ui.resolve(e), [image], fullSize(e.viewport)) : next(e);
	});
};

export { register };