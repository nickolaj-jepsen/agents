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

// ../../lib/kits/legacy/src/claude/ui.tsx
/** A pane with fewer body rows than this drops the blank rows between its blocks. */
const TIGHT_ROWS = 16;
/**
* Binds the resolved elements to the surface they came from, and to the room it measured.
* @param els What `$.ui.resolve(e)` answered.
* @param e The render event: `surface`, `viewport` and the pane's or band's `props`.
*/
const kitOf = (els, e) => {
	const p = e.props ?? {};
	return {
		Box: els.Box,
		Text: els.Text,
		Button: els.Button,
		Markdown: els.Markdown,
		Image: els.Image,
		Link: els.Link,
		Svg: els.Svg,
		surface: e.surface,
		isNative: e.surface !== "terminal",
		columns: Math.max(1, Math.floor(p.bodyColumns ?? e.viewport?.columns ?? 80)),
		maxRows: p.maxRows,
		isTight: (p.scroll?.bodyRows ?? 1e400) < TIGHT_ROWS,
		title: p.title,
		placement: p.placement
	};
};
/**
* The house style's numbers, glyphs and colour roles; one edit here restyles every mod that
* carries a fresh copy of this file.
*/
const tokens = {
	/** Width classes: caps in columns, never targets. `wide` is the pane less `wideMargin`. */
	width: {
		reading: 96,
		split: 124,
		dialog: 72,
		wideMargin: 2
	},
	/** What a pane is opened with, whichever mod opens it: `"transparent"` is no fill under the body. */
	pane: { backgroundColor: "transparent" },
	/** Prose is wrapped at this measure even in a wider pane. */
	prose: 80,
	/** From this many pane columns a list with detail is two panes; below it stacks. */
	splitFrom: 110,
	/** Cells of padding inside a border. */
	padding: 1,
	/** Cells between metadata columns, and before the first. */
	gutter: 2,
	/** Cells between the keys of a button row. */
	keyGap: 3,
	/** From this pane width dated entries use a date column; narrower, a date line. */
	entriesFrom: 50,
	/** Cells of the date column of dated entries: an ISO date. */
	dateWidth: 10,
	/** A row's title is never given less than this; metadata columns drop first. */
	minTitle: 16,
	glyph: {
		pointer: "❯",
		multi: {
			off: "□",
			on: "■"
		},
		single: {
			off: "○",
			on: "●"
		},
		ellipsis: "…",
		more: {
			up: "↑",
			down: "↓"
		},
		rule: "─",
		done: "✓",
		times: "×",
		noteMid: "│",
		noteEnd: "╰▸",
		kind: {
			missing: "+",
			stale: "↻",
			wrong: "!"
		},
		status: { warning: "⚠" },
		fold: {
			closed: "▸",
			open: "▾"
		}
	},
	/** Lines of a folded claim on the terminal. */
	foldedLines: 3,
	/** Inline code on the terminal, outside a `Markdown`: the theme colour its Markdown uses. */
	code: "permission",
	/** The graphical surfaces' numbers: none of them is a cell. */
	gui: {
		/** A long list shows this many rows, then an `N more` row. */
		maxItems: 12,
		/**
		* The widest a choice's label may be, in cells, before a graphical surface sets it as text
		* under a Button of its `short` word: a Button never wraps and runs off a 420-pixel pane.
		*/
		maxLabel: 34,
		/**
		* Icon colours. The host's theme cannot be read from a mod and an image cannot follow it, so
		* the neutral is one mid-grey that reads on light and dark; colour marks a state only.
		*/
		tone: {
			neutral: "#8b8f98",
			error: "#e5534b",
			warning: "#d4962a",
			success: "#3fa65b"
		},
		/** An icon's side, in CSS pixels. */
		icon: 16,
		/**
		* The column, in cells, that leads each row of a choice drawn as rows: its key's Button (`A`)
		* or an icon, centred, so every row's text starts at one edge.
		*/
		lead: 4.6,
		/**
		* A passage longer than this, in cells, or of more than one line, is cut to one line with a
		* `More` beside it (`excerpt`): about what one line of a 420-pixel band holds beside the button.
		*/
		excerptCells: 40,
		/**
		* The vertical rhythm, in lines of body text. A step name is a whole line or none on VS Code,
		* too coarse for a short pane, so the kit spaces with these numbers. `xs` sits between the
		* lines of one part (a label and its text), `sm` between the parts of one item (claim, meta,
		* evidence, keys), `md` between items that stand alone (groups, the pane's regions).
		*/
		space: {
			xs: .2,
			sm: .5,
			md: .9
		},
		/**
		* Horizontal room, in cells: `xs` between the buttons of a row, `sm` after an icon, `md`
		* between a line's text and its control, and `inset` on each side of a row, which is where
		* an opened row's fill reaches.
		*/
		across: {
			xs: .6,
			sm: .8,
			md: 1.2,
			inset: 1
		},
		/**
		* The fill of an opened row: the theme's own second background, a well the row's body sits
		* in, which a quiet button's outline still reads on.
		*/
		fill: "userMessageBackground",
		/** Behind a code span in a Text, which has no code face: the theme's code background. */
		chip: "bashMessageBackgroundColor",
		/** A thin rule's colour: one grey at low alpha, which reads on a light theme and a dark one. */
		rule: "#8b8f9866",
		/**
		* The least a form's label column takes, in cells, so its controls start at one edge: a
		* label longer than this pushes only its own control.
		*/
		labelColumn: 7
	},
	/**
	* The style's roles as a mod draws them: `dim` is `dimColor`, `text` is the default,
	* the rest are theme colours. `note` is the colour of the words a person wrote.
	*/
	role: {
		text: void 0,
		dim: void 0,
		accent: "claude",
		success: "success",
		warning: "warning",
		error: "error",
		note: "suggestion"
	}
};
/** What each icon stands for on the terminal, where one glyph does it. */
const ICON_GLYPH = {
	wrong: tokens.glyph.kind.wrong,
	stale: tokens.glyph.kind.stale,
	missing: tokens.glyph.kind.missing,
	warning: tokens.glyph.status.warning,
	success: tokens.glyph.done,
	error: tokens.glyph.times,
	pending: tokens.glyph.single.off,
	question: "?",
	note: tokens.glyph.noteEnd,
	write: "✎",
	status: tokens.glyph.single.off,
	priorityNone: "-",
	priorityLow: "!",
	priorityMedium: "!!",
	priorityHigh: "!!!",
	priorityUrgent: tokens.glyph.status.warning,
	project: tokens.glyph.multi.off,
	label: tokens.glyph.single.on,
	draft: "✎"
};
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
/** Draws images at their aspect ratios, each with an optional path link below it. */
function imageGallery(k, images, options) {
	const { Box, Text, Image, Link } = k;
	return /* @__PURE__ */ h(Box, {
		flexDirection: "column",
		rowGap: 1
	}, options.caption ? /* @__PURE__ */ h(Text, { dimColor: true }, options.caption) : null, images.map((image) => {
		const box = fitImage(image.size, options);
		return /* @__PURE__ */ h(Box, {
			key: image.key,
			flexDirection: "column",
			rowGap: 1
		}, Image ? /* @__PURE__ */ h(Image, {
			source: image.source,
			columns: box.columns,
			rows: box.rows,
			alt: image.alt
		}) : /* @__PURE__ */ h(Text, { dimColor: true }, image.alt), image.path ? /* @__PURE__ */ h(Text, {
			dimColor: true,
			wrap: "wrap"
		}, Link ? /* @__PURE__ */ h(Link, {
			href: fileUrl(image.path),
			label: image.path
		}) : image.path) : null);
	}));
}

// src/claude.tsx
const fullSize = (viewport) => ({
	columns: Math.max(1, Math.min(144, (viewport?.columns ?? 84) - 4)),
	rows: Math.max(1, Math.min(42, Math.floor((viewport?.rows ?? 48) * .6)))
});
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
		const { Box, Text } = els;
		return /* @__PURE__ */ h(Box, { flexDirection: "column" }, native, /* @__PURE__ */ h(Box, {
			flexDirection: "column",
			marginLeft: 2
		}, imageGallery(kitOf(els, e), [{
			...first,
			path: void 0
		}], {
			...thumbnail,
			columns: Math.min(thumbnail.columns, fullSize(e.viewport).columns)
		}), count > 1 ? /* @__PURE__ */ h(Text, { dimColor: true }, `+${count - 1} more`) : null));
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
		const images = [];
		for (const [index, image] of attachmentImages(e.props.output).entries()) {
			const preview = await loadLocal($, image, localCache);
			if (preview) images.push({
				...preview,
				key: `${index}:${preview.key}`,
				path: void 0
			});
		}
		return images.length ? /* @__PURE__ */ h(els.Box, {
			flexDirection: "column",
			rowGap: 1
		}, native, imageGallery(kit, images, fullSize(e.viewport))) : native;
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
		return image ? imageGallery(kitOf($.ui.resolve(e), e), [image], fullSize(e.viewport)) : next(e);
	});
};

export { register };