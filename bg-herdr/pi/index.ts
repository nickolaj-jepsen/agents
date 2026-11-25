import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash, randomUUID } from "node:crypto";
import { statSync } from "node:fs";
import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// src/lib/state.ts
/**
* The `bg:state` snapshot, protocol 1, as the bg extension emits it, and the
* one mapping from a task's lifecycle to the word Herdr shows.
*
* Everything here is untrusted input: the snapshot arrives on pi's event bus
* from another package, so a task is only kept when its id, lifecycle and start
* time are the shapes bg promises, and every text field is bounded before it can
* reach a terminal or a label.
*/
const PROTOCOL = 1;
/** bg's closed lifecycle: `running` and `stopping` still have a live process group. */
const TASK_STATES = [
	"running",
	"stopping",
	"exited",
	"failed"
];
/** Fields the monitor cannot invent: without them a task never becomes a terminal. */
const STATES = new Set(TASK_STATES);
const LIMITS = {
	name: 200,
	command: 2e3,
	cwd: 400,
	path: 400,
	signal: 32,
	id: 64
};
const MAX_TASKS = 200;
const text = (value, limit) => typeof value === "string" ? value.slice(0, limit) : "";
const token = (value, limit) => {
	const value2 = text(value, limit).trim();
	return value2 === "" ? void 0 : value2;
};
const finite = (value) => typeof value === "number" && Number.isFinite(value) ? value : void 0;
const whole = (value) => {
	const number = finite(value);
	return number === void 0 ? null : Math.trunc(number);
};
/** One task, or undefined when it lacks an id, a known lifecycle or a start time. */
function parseTask(value) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) return void 0;
	const task = value;
	const id = finite(task.id);
	const state = task.state;
	const startedAt = finite(task.startedAt);
	if (id === void 0 || !Number.isInteger(id) || id <= 0) return void 0;
	if (typeof state !== "string" || !STATES.has(state)) return void 0;
	if (startedAt === void 0 || startedAt <= 0) return void 0;
	const pid = whole(task.pid);
	return {
		id,
		name: text(task.name, LIMITS.name),
		pid: pid !== null && pid > 0 ? pid : null,
		path: text(task.path, LIMITS.path),
		cwd: text(task.cwd, LIMITS.cwd),
		command: text(task.command, LIMITS.command),
		state,
		code: whole(task.code),
		signal: token(task.signal, LIMITS.signal) ?? null,
		startedAt,
		finishedAt: whole(task.finishedAt)
	};
}
/** A whole snapshot, or undefined when it is not protocol 1 or has no session. */
function parseSnapshot(value) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) return void 0;
	const snapshot = value;
	if (finite(snapshot.protocol) !== 1) return void 0;
	const sessionId = token(snapshot.sessionId, LIMITS.id);
	if (sessionId === void 0) return void 0;
	const type = snapshot.type;
	if (type !== "snapshot" && type !== "stopped") return void 0;
	const instanceId = text(snapshot.instanceId, LIMITS.id);
	const sequence = finite(snapshot.sequence) ?? 0;
	const tasks = [];
	const seen = /* @__PURE__ */ new Set();
	for (const entry of type === "stopped" || !Array.isArray(snapshot.tasks) ? [] : snapshot.tasks) {
		if (tasks.length >= MAX_TASKS) break;
		const task = parseTask(entry);
		if (!task || seen.has(task.id)) continue;
		seen.add(task.id);
		tasks.push(task);
	}
	return {
		protocol: 1,
		sessionId,
		instanceId,
		sequence: Math.trunc(sequence),
		type,
		tasks
	};
}
/**
* The lifecycle word herdr-ui's monitor row reads from the terminal's labels
* (`mods/nested-spaces/monitor-row.js`): `working`, `waiting`, `idle` (shown as
* "Finished"), `failed` or `interrupted`. Undefined leaves the row as "Monitor"
* rather than claiming an ending we cannot vouch for.
*/
function monitorStateOf(task) {
	switch (task.state) {
		case "running":
		case "stopping": return "working";
		case "failed": return "failed";
		case "exited":
			if (task.signal !== null) return "interrupted";
			if (task.code === null) return void 0;
			return task.code === 0 ? "idle" : "failed";
		default: return;
	}
}

// src/pi/bridge.ts
/** `hc` addresses a terminal as `t7`, or `machine/t7` through another machine. */
const ADDRESS = /^t[a-z0-9]+$/;
const PARENT = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)?$/;
const LABEL = "bg-herdr";
const OWNER = `${LABEL}.owner`;
/** Untrusted text as one bounded label value: no controls, no line breaks. */
const cleanLabel = (value) => value.replace(/[\x00-\x1f\x7f-\x9f\u061c\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
/** hc's "no such terminal": a removed one is not an error to report again. */
function alreadyRemoved(error) {
	if (!error || typeof error !== "object" || !("stderr" in error)) return false;
	try {
		return JSON.parse(String(error.stderr)).error?.kind === "not_found";
	} catch {
		return false;
	}
}
/** An existing directory for `--cwd`, or the session's own. */
function directoryOf(cwd, fallback) {
	if (typeof cwd !== "string" || !cwd.startsWith("/")) return fallback;
	try {
		if (statSync(cwd).isDirectory()) return cwd;
	} catch {}
	return fallback;
}
/**
* One read-only Herdr child terminal per bg task. It never starts a program of
* its own beyond the monitor, never forwards input, and never kills a terminal
* it cannot prove it owns: a replacement Herdr core gives old addresses to other
* programs.
*/
async function createBgHerdrBridge(options) {
	if (typeof options.parent !== "string" || !PARENT.test(options.parent)) throw new Error("bg-herdr: a Herdr parent terminal id is required");
	const now = options.now ?? (() => Date.now());
	const dir = await mkdtemp(join(tmpdir(), "bg-herdr-"));
	const owner = randomUUID();
	const desired = /* @__PURE__ */ new Map();
	const children = /* @__PURE__ */ new Map();
	let instance;
	let sequence = -1;
	let script;
	let queue = Promise.resolve();
	let closed = false;
	let lastError;
	const report = (error) => {
		lastError = error instanceof Error ? error.message : String(error);
		options.onError(error);
	};
	const monitorScript = () => script ??= options.script(dir);
	const fileFor = (id) => join(dir, `${createHash("sha256").update(id).digest("hex").slice(0, 16)}.json`);
	const labelsOf = (record) => {
		const name = cleanLabel(record.name) || `bg task ${record.id}`;
		const state = monitorStateOf(record);
		return [
			`${LABEL}=true`,
			`${OWNER}=${owner}`,
			`${LABEL}.task=${record.id}`,
			`${LABEL}.session=${cleanLabel(options.sessionId)}`,
			`${LABEL}.state=${record.state}`,
			`${LABEL}.name=${name}`,
			"fireproof.pi-agent-monitor=true",
			`fireproof.pi-agent-name=${name}`,
			...state === void 0 ? [] : [`fireproof.pi-agent-state=${state}`]
		];
	};
	const kill = async (address) => {
		try {
			const terminal = JSON.parse(await options.run([
				"get",
				address,
				"--json"
			]));
			if (terminal?.parent !== options.parent || terminal.labels?.[OWNER] !== owner) return;
			await options.run(["kill", address]);
		} catch (error) {
			if (!alreadyRemoved(error)) throw error;
		}
	};
	const remove = async (id) => {
		const child = children.get(id);
		if (!child) return;
		children.delete(id);
		try {
			await kill(child.address);
		} catch (error) {
			report(error);
		} finally {
			await rm(child.file, { force: true });
		}
	};
	const launch = async (record, file) => {
		const monitor = await monitorScript();
		const output = await options.run([
			"run",
			"--bg",
			"--json",
			"--no-notify",
			"--rm",
			"--parent",
			options.parent,
			"--cwd",
			directoryOf(record.cwd, options.cwd),
			...labelsOf(record).flatMap((label) => ["--label", label]),
			"--",
			process.execPath,
			monitor,
			file,
			String(process.pid)
		]);
		const address = JSON.parse(output).address;
		if (typeof address !== "string" || !ADDRESS.test(address)) throw new Error("hc returned an invalid monitor address");
		return address;
	};
	const sync = async () => {
		if (closed) return;
		for (const id of [...children.keys()].filter((id) => !desired.has(id))) await remove(id);
		for (const [id, record] of desired) {
			if (closed) return;
			try {
				const child = children.get(id);
				const file = child?.file ?? fileFor(id);
				const content = JSON.stringify(record);
				if (content !== child?.content) {
					await writeFile(`${file}.tmp`, content, { mode: 384 });
					await rename(`${file}.tmp`, file);
				}
				const labels = labelsOf(record);
				if (child) {
					if (child.labels !== labels.join("\n")) await options.run([
						"label",
						child.address,
						...labels
					]);
					child.labels = labels.join("\n");
					child.content = content;
					continue;
				}
				const address = await launch(record, file);
				children.set(id, {
					address,
					file,
					content,
					labels: labels.join("\n")
				});
			} catch (error) {
				report(error);
			}
		}
	};
	const enqueue = (work) => {
		queue = queue.then(work).catch(report);
		return queue;
	};
	return {
		accept(value) {
			const snapshot = parseSnapshot(value);
			if (closed || !snapshot || snapshot.sessionId !== options.sessionId) return;
			if (snapshot.instanceId === instance) {
				if (snapshot.sequence <= sequence) return;
			} else instance = snapshot.instanceId;
			sequence = snapshot.sequence;
			const seen = /* @__PURE__ */ new Set();
			for (const task of snapshot.tasks) {
				const id = String(task.id);
				seen.add(id);
				const old = desired.get(id);
				desired.set(id, {
					...task,
					observedAt: task.state === old?.state ? old.observedAt : now()
				});
			}
			for (const id of [...desired.keys()].filter((id) => !seen.has(id))) desired.delete(id);
			enqueue(sync);
		},
		/** Reconcile live ownership, including launches whose CLI reply was lost. */
		refresh() {
			return enqueue(async () => {
				if (closed) return;
				const list = JSON.parse(await options.run([
					"ls",
					"--json",
					"--label",
					`${OWNER}=${owner}`
				]));
				if (!list || typeof list !== "object" || !("terminals" in list) || !Array.isArray(list.terminals)) throw new Error("Invalid hc terminal list");
				const records = [];
				for (const summary of list.terminals) {
					if (!summary || !/^t[a-z0-9]+$/.test(summary.address)) continue;
					try {
						records.push(JSON.parse(await options.run([
							"get",
							summary.address,
							"--json"
						])));
					} catch (error) {
						if (!alreadyRemoved(error)) throw error;
					}
				}
				const live = records.filter((t) => ADDRESS.test(t.address) && t.parent === options.parent && t.state === "live" && t.labels?.[OWNER] === owner);
				const addresses = new Set(live.map((t) => t.address));
				for (const [id, child] of children) {
					if (addresses.has(child.address)) continue;
					try {
						const terminal = JSON.parse(await options.run([
							"get",
							child.address,
							"--json"
						]));
						if (terminal?.state === "live" && terminal.parent === options.parent && terminal.labels?.[OWNER] === owner) {
							live.push(terminal);
							addresses.add(terminal.address);
							continue;
						}
					} catch (error) {
						if (!alreadyRemoved(error)) throw error;
					}
					children.delete(id);
				}
				for (const terminal of live) {
					const id = terminal.labels?.[`${LABEL}.task`];
					if (!id || !desired.has(id)) {
						await kill(terminal.address);
						continue;
					}
					if (!children.has(id)) children.set(id, {
						address: terminal.address,
						file: fileFor(id)
					});
					else if (children.get(id).address !== terminal.address) await kill(terminal.address);
				}
				lastError = void 0;
				await sync();
			});
		},
		flush: () => queue,
		status: () => ({
			tasks: desired.size,
			monitors: children.size,
			lastError
		}),
		async dispose() {
			closed = true;
			await queue;
			for (const id of children.keys()) try {
				await remove(id);
			} catch (error) {
				report(error);
			}
			await rm(dir, {
				recursive: true,
				force: true
			});
		}
	};
}

// src/pi/monitor.ts
async function monitorMain(io, snapshotPath, parentPid) {
	const KNOWN = /* @__PURE__ */ new Set([
		"running",
		"stopping",
		"exited",
		"failed"
	]);
	const STATUS = /* @__PURE__ */ new Map([
		["running", "working"],
		["stopping", "working"],
		["failed", "error"]
	]);
	const EXPLANATIONS = /* @__PURE__ */ new Map([
		["running", "running; its output appears below"],
		["stopping", "stop requested; waiting for it to end"],
		["exited", "ended; see the exit code"],
		["failed", "never started; pi's session has the error"],
		["unknown", "unrecognized state; only a newer bg can explain it"]
	]);
	const DEFAULT_COLUMNS = 80;
	const DEFAULT_ROWS = 24;
	const MIN_COLUMNS = 20;
	const MAX_COLUMNS = 400;
	const MIN_ROWS = 6;
	const MAX_ROWS = 200;
	const NAME_LIMIT = 120;
	const FIELD_LIMIT = 240;
	const MAX_RECORD_CHARS = 65536;
	const LOG_BYTES = 16384;
	const LOG_LINE_CHARS = 4096;
	const POLL_MS = 300;
	const CLEAR = "\x1B[2J\x1B[H";
	const HOME = "\x1B[H";
	const FOOTER = ["", "Read-only bg monitor. Stop the task from pi's session: bg_stop."];
	const TERMINAL_SEQUENCE = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b[\]P^_][\s\S]*?(?:\x07|\x1b\\)/g;
	const UNSAFE = /[\x00-\x1f\x7f-\x9f\u061c\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g;
	const wellFormed = (text) => {
		const fn = text.toWellFormed;
		return typeof fn === "function" ? fn.call(text) : text;
	};
	/** One untrusted value as bounded single-line text; anything exotic becomes "". */
	const bounded = (value, limit) => {
		const text = wellFormed(typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : "").replace(TERMINAL_SEQUENCE, " ").replace(UNSAFE, " ").replace(/\s+/g, " ").trim();
		const chars = Array.from(text);
		return chars.length > limit ? chars.slice(0, limit).join("") : text;
	};
	/** A command is one line of the terminal, not a script: only its first line. */
	const firstLine = (value) => {
		if (typeof value !== "string") return "";
		const first = wellFormed(value).split("\n")[0] ?? "";
		return bounded(first, FIELD_LIMIT);
	};
	const WIDE = /[\u1100-\u115f\u2e80-\u303e\u3041-\u33ff\u3400-\u4dbf\u4e00-\u9fff\ua000-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]|[\u{1f000}-\u{1faff}\u{20000}-\u{3fffd}]/u;
	const cellWidth = (char) => WIDE.test(char) ? 2 : 1;
	const cellsOf = (text) => {
		let width = 0;
		for (const char of text) width += cellWidth(char);
		return width;
	};
	const truncate = (text, width) => {
		if (width <= 0) return "";
		if (cellsOf(text) <= width) return text;
		if (width === 1) return "…";
		let used = 0;
		let out = "";
		for (const char of text) {
			const cells = cellWidth(char);
			if (used + cells > width - 1) break;
			out += char;
			used += cells;
		}
		return `${out}…`;
	};
	const clampInt = (value, min, max, fallback) => typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.trunc(value))) : fallback;
	const viewOf = () => ({
		columns: clampInt(process.stdout.columns, MIN_COLUMNS, MAX_COLUMNS, DEFAULT_COLUMNS),
		rows: clampInt(process.stdout.rows, MIN_ROWS, MAX_ROWS, DEFAULT_ROWS)
	});
	const fitLine = (line, width) => {
		const text = truncate(line, width);
		return text + " ".repeat(Math.max(0, width - cellsOf(text)));
	};
	const timestamp = (value) => typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 864e13 ? value : void 0;
	const formatDuration = (ms) => {
		const total = Math.floor(Math.max(0, ms) / 1e3);
		if (total < 60) return `${total}s`;
		const minutes = Math.floor(total / 60);
		const seconds = total % 60;
		if (minutes < 60) return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
		const hours = Math.floor(minutes / 60);
		const restMinutes = minutes % 60;
		if (hours < 24) return restMinutes > 0 ? `${hours}h ${restMinutes}m` : `${hours}h`;
		const days = Math.floor(hours / 24);
		const restHours = hours % 24;
		return restHours > 0 ? `${days}d ${restHours}h` : `${days}d`;
	};
	const formatAgo = (ms) => ms < 1e3 ? "just now" : `${formatDuration(ms)} ago`;
	/** The status word the lifecycle and the exit add up to (../lib/state.ts). */
	const statusOf = (state, code, signal) => {
		if (state === "exited") return signal !== null ? "idle" : code === 0 ? "done" : "error";
		return STATUS.get(state) ?? "idle";
	};
	/** The title and OSC 7501 status Herdr reads; the payload is sanitized first. */
	const protocolHead = (title, state, status) => {
		const name = bounded(title, NAME_LIMIT) || "task";
		const lifecycle = KNOWN.has(state) ? state : "unknown";
		return `\x1b]0;bg task: ${name}\x07\x1b]7501;state=${status}:app=bg:msg=${Buffer.from(`${name}: ${lifecycle}`, "utf8").toString("base64")}\x1b\\`;
	};
	const parseRecord = (content) => {
		if (content.length > MAX_RECORD_CHARS) return void 0;
		try {
			const value = JSON.parse(content);
			return value !== null && typeof value === "object" && !Array.isArray(value) ? value : void 0;
		} catch {
			return;
		}
	};
	/** The last `limit` bytes of a log, or undefined when it cannot be read. */
	const readTail = async (path, limit) => {
		let file;
		try {
			file = await io.open(path, "r");
			const { size } = await file.stat();
			const start = Math.max(0, size - limit);
			const buffer = Buffer.alloc(size - start);
			await file.read(buffer, 0, buffer.length, start);
			const text = buffer.toString("utf8");
			return start > 0 ? text.slice(text.indexOf("\n") + 1) : text;
		} catch {
			return;
		} finally {
			try {
				await file?.close();
			} catch {}
		}
	};
	/** The log of the record being drawn, read each poll so the window stays live. */
	const logOf = async (record) => {
		const path = record?.path;
		if (typeof path !== "string" || !path.startsWith("/") || path.length > LOG_LINE_CHARS) return [];
		const text = await readTail(path, LOG_BYTES);
		if (typeof text !== "string") return [];
		return text.split("\n").map((line) => bounded(line.slice(0, LOG_LINE_CHARS), FIELD_LIMIT)).filter((line, index, all) => line !== "" || index !== all.length - 1);
	};
	/** The whole frame: a header, the task, then as much of its log as fits. */
	const screenOf = (record, log, view) => {
		const { columns, rows } = view;
		const now = io.now();
		const state = typeof record.state === "string" && KNOWN.has(record.state) ? record.state : "unknown";
		const code = typeof record.code === "number" ? Math.trunc(record.code) : null;
		const signal = typeof record.signal === "string" ? record.signal : null;
		const status = statusOf(state, code, signal);
		const id = typeof record.id === "number" && Number.isFinite(record.id) ? Math.trunc(record.id) : void 0;
		const name = bounded(record.name, NAME_LIMIT) || (id === void 0 ? "" : `#${id}`) || "task";
		const title = id === void 0 ? name : `#${id} ${name}`;
		const badge = state.toUpperCase();
		const left = truncate(title, Math.max(0, columns - badge.length - 1));
		const header = left + " ".repeat(Math.max(1, columns - badge.length - cellsOf(left))) + badge;
		const rule = "─".repeat(columns);
		const startedAt = timestamp(record.startedAt);
		const finishedAt = timestamp(record.finishedAt);
		const details = [`State: ${state} — ${EXPLANATIONS.get(state) ?? ""}`];
		if (startedAt !== void 0 && finishedAt !== void 0) {
			const ended = state === "exited" ? `, ended ${formatAgo(now - finishedAt)}` : "";
			details.push(`Ran ${formatDuration(finishedAt - startedAt)}${ended}`);
		} else if (startedAt !== void 0) details.push(`Running ${formatDuration(now - startedAt)}`);
		const exit = [code === null ? "" : `exit ${code}`, signal === null ? "" : `signal ${bounded(signal, 32)}`].filter(Boolean);
		if (exit.length > 0) details.push(exit.join(", "));
		if (typeof record.pid === "number" && record.pid > 0 && (state === "running" || state === "stopping")) details.push(`Process group ${record.pid}`);
		const command = firstLine(record.command);
		if (command) details.push(`Command: ${command}`);
		const cwd = bounded(record.cwd, FIELD_LIMIT);
		if (cwd) details.push(`Directory: ${cwd}`);
		const path = bounded(record.path, FIELD_LIMIT);
		if (path) details.push(`Log: ${path}`);
		const room = rows - 1;
		const lines = [
			header,
			rule,
			...details.slice(0, Math.max(0, room - 2))
		];
		let spare = room - lines.length;
		const footer = spare - 2 - 2 >= FOOTER.length ? FOOTER : [];
		spare -= footer.length;
		if (spare >= 2 && log.length > 0) lines.push(rule, ...log.slice(-(spare - 1)));
		lines.push(...footer);
		return {
			head: protocolHead(title, state, status),
			body: `${lines.map((line) => fitLine(line, columns)).join("\n")}\n`
		};
	};
	/** A record we cannot read still gets a bounded, honest screen and no crash. */
	const unreadableScreen = (view) => {
		return {
			head: protocolHead("task", "unknown", "idle"),
			body: `${[
				"Unreadable task state",
				"",
				"The monitor keeps watching; pi's session may be restarting."
			].slice(0, Math.max(1, view.rows - 1)).map((line) => fitLine(line, view.columns)).join("\n")}\n`
		};
	};
	const write = (text) => {
		try {
			io.write(text);
		} catch {}
	};
	const path = typeof snapshotPath === "string" ? snapshotPath : "";
	const pid = Number(parentPid);
	const hasParent = Number.isInteger(pid) && pid > 0;
	const parentAlive = () => {
		try {
			process.kill(pid, 0);
			return true;
		} catch (error) {
			return error?.code === "EPERM";
		}
	};
	process.stdin.resume();
	if (process.stdin.listenerCount("data") === 0) process.stdin.on("data", () => {});
	if (process.stdin.listenerCount("error") === 0) process.stdin.on("error", () => {});
	if (process.stdout.listenerCount("error") === 0) process.stdout.on("error", () => {});
	let stopped = false;
	const stop = () => {
		stopped = true;
	};
	const SIGNALS = [
		"SIGTERM",
		"SIGINT",
		"SIGHUP"
	];
	for (const signal of SIGNALS) process.once(signal, stop);
	let lastHead = "";
	let lastBody = "";
	try {
		while (!stopped && !(hasParent && !parentAlive())) {
			const view = viewOf();
			let content;
			try {
				content = await io.readFile(path);
			} catch {
				break;
			}
			const record = parseRecord(content);
			const frame = record === void 0 ? unreadableScreen(view) : screenOf(record, await logOf(record), view);
			if (frame.head !== lastHead) {
				write(frame.head + CLEAR + frame.body);
				lastHead = frame.head;
				lastBody = frame.body;
			} else if (frame.body !== lastBody) {
				write(HOME + frame.body);
				lastBody = frame.body;
			}
			try {
				await io.delay(POLL_MS);
			} catch {
				break;
			}
		}
	} finally {
		for (const signal of SIGNALS) process.removeListener(signal, stop);
		write("\x1B]7501;state=clear\x1B\\");
		process.stdin.pause();
	}
}

// src/pi/script.ts
/**
* The monitor runs as its own program, so the script it runs is written from
* `monitorMain`'s source: the repo's bundler ships `src/pi.ts` and no side
* files, so anything the script needed from a module scope would be missing in
* `dist/`. The prelude is fixed text and the function is passed as a value, so
* no part of this is a shell command, and no snapshot field is ever interpolated
* into code.
*/
const PRELUDE = ["import { open, readFile } from \"node:fs/promises\";", "import { setTimeout as delay } from \"node:timers/promises\";"].join("\n");
function monitorScriptSource(main) {
	return [
		"// The read-only monitor for one bg task, written by bg-herdr. Do not edit.",
		PRELUDE,
		`const monitor = ${main.toString().trim()};`,
		"await monitor(",
		"  { readFile, open, delay, write: (text) => process.stdout.write(text), now: () => Date.now() },",
		"  process.argv[2],",
		"  process.argv[3],",
		");",
		""
	].join("\n");
}
/** Writes the script into the bridge's private folder and returns its path. */
async function writeMonitorScript(dir, main) {
	const file = join(dir, "monitor.mjs");
	await mkdir(dir, {
		recursive: true,
		mode: 448
	});
	await writeFile(file, monitorScriptSource(main), { mode: 384 });
	return file;
}

// src/pi.ts
/**
* bg tasks as read-only Herdr child terminals: one per task, showing its
* lifecycle and the tail of its log, so a long build is visible beside the
* session instead of only in a wake message.
*
* This is a separate package on purpose: it needs the Herdr core CLI (`hc`) and
* a Herdr terminal, and pi itself must work without either. It draws nothing of
* its own in pi; the monitors are Herdr's terminals.
*/
const exec = promisify(execFile);
/** bg's replayable snapshot, and the request that makes it answer with one. */
const STATE_EVENT = "bg:state";
const STATE_REQUEST_EVENT = "bg:state:request";
const REFRESH_MS = 5e3;
function bgHerdr(pi) {
	let bridge;
	let unsubscribe;
	let timer;
	const request = () => pi.events.emit(STATE_REQUEST_EVENT, { protocol: 1 });
	const close = async () => {
		if (timer) clearInterval(timer);
		timer = void 0;
		unsubscribe?.();
		unsubscribe = void 0;
		const old = bridge;
		bridge = void 0;
		await old?.dispose();
	};
	pi.on("session_start", async (_event, ctx) => {
		await close();
		const parent = process.env.HC_TERMINAL_ID;
		if (!parent || ctx.mode !== "tui") return;
		const hc = process.env.PI_BG_HERDR_HC || "hc";
		try {
			await exec(hc, ["--version"], { timeout: 5e3 });
		} catch {
			ctx.ui.notify("Herdr bg monitors disabled: hc is unavailable. Install the Herdr core, then /reload.", "warning");
			return;
		}
		let warned = false;
		bridge = await createBgHerdrBridge({
			parent,
			sessionId: ctx.sessionManager.getSessionId(),
			cwd: ctx.cwd,
			script: (dir) => writeMonitorScript(dir, monitorMain),
			run: async (args) => (await exec(hc, args, {
				timeout: 5e3,
				maxBuffer: 1048576
			})).stdout,
			onError: () => {
				if (warned) return;
				warned = true;
				ctx.ui.notify("Herdr bg monitors temporarily unavailable; the tasks keep running. Retrying automatically.", "warning");
			}
		});
		unsubscribe = pi.events.on(STATE_EVENT, (value) => bridge?.accept(value));
		request();
		let checking = false;
		timer = setInterval(() => {
			if (checking || !bridge) return;
			checking = true;
			request();
			bridge.refresh().finally(() => {
				checking = false;
			});
		}, REFRESH_MS);
		timer.unref();
	});
	pi.on("session_shutdown", close);
}

export { bgHerdr as default };