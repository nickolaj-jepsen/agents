import { Type } from "typebox";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { closeSync, fstatSync, mkdtempSync, openSync, readSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// src/lib/protocol.ts
/**
* What this package publishes on pi's shared event bus, so that another
* package can follow this session's background tasks without importing it
* (Herdr's child terminals are one such consumer).
*
* Every change is one complete snapshot: a consumer holds no state of its own
* and cannot drift. Finished tasks stay in the list until the session ends, so
* their logs stay reachable; `type: "stopped"` then empties it.
*/
const BG_STATE = "bg:state";
const BG_STATE_REQUEST = "bg:state:request";
/** The tool names, which the tasks' messages and the docs quote. */
const BG_RUN = "bg_run";
const BG_WAIT = "bg_wait";
const BG_STATUS = "bg_status";
const BG_STOP = "bg_stop";
/** Whether the task's process group may still be alive. */
const isRunning = (state) => state === "running" || state === "stopping";

// src/lib/tail.ts
const TAIL = {
	lines: 40,
	bytes: 4096
};
/**
* Shapes one bounded read into the text a tool result carries. `cut` says the
* read began mid-file, so its first line is a fragment and is dropped; the same
* goes for a read longer than `limits.bytes`, whatever the caller passed.
*/
function tailOfLog(log, limits = TAIL) {
	let { bytes } = log;
	let cut = log.cut;
	if (bytes.length > limits.bytes) {
		bytes = bytes.subarray(bytes.length - limits.bytes);
		cut = true;
	}
	if (bytes.length === 0) return {
		text: "",
		truncated: false
	};
	let lines = new TextDecoder().decode(bytes).split("\n");
	if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
	if (cut) lines.shift();
	let truncated = cut;
	if (lines.length > limits.lines) {
		lines = lines.slice(-limits.lines);
		truncated = true;
	}
	return {
		text: lines.join("\n"),
		truncated
	};
}

// src/lib/report.ts
/**
* What a tool call says about a task. Plain lines: the model reads them, and a
* person watching reads the same text in the transcript.
*/
/** Seconds a task has taken: up to now while it runs, else to its exit. */
const secondsOf = (task, now) => Math.max(0, Math.round(((task.finishedAt ?? now) - task.startedAt) / 1e3));
/** How it ended, or what it is doing: `exited 0`, `exited SIGTERM`, `running`, `failed`. */
const stateText = (task) => {
	if (task.state === "exited") return `exited ${task.code ?? task.signal ?? "?"}`;
	if (task.state === "failed") return "failed to start";
	return task.state;
};
/** The first line of a command, cut to fit a line. */
const commandLine = (command, max = 100) => {
	const line = (command.split("\n")[0] ?? "").trim();
	return line.length > max ? `${line.slice(0, max - 1)}…` : line;
};
/** The lines under a task's status: its log, and the tail when there is one. */
const tailLines = (tail) => {
	const lines = tail.text === "" ? ["(no output)"] : tail.text.split("\n");
	return tail.truncated ? [...lines, "(earlier output cut; the whole log is at the path above)"] : lines;
};
const startText = (task) => [`#${task.id} started, pid ${task.pid ?? "?"}. Log: ${task.path}`, `Nothing interrupts you when it ends: \`${BG_WAIT}\` with \`{"id":${task.id}}\` returns its exit code and last ${TAIL.lines} lines once it does. \`${BG_STATUS}\` lists this session's tasks, and \`${BG_STOP}\` with that id ends it.`].join("\n");
const endText = (task, tail, now) => [`#${task.id} ${JSON.stringify(task.name)} ${stateText(task)} after ${secondsOf(task, now)}s. Log: ${task.path}`, ...tailLines(tail)].join("\n");
/** A wait that gave up: the task runs on, and its log is where it is now. */
const timeoutText = (task, tail, now) => [`#${task.id} ${JSON.stringify(task.name)} still running after ${secondsOf(task, now)}s. Log: ${task.path}`, ...tailLines(tail)].join("\n");
/** The whole session's tasks, one two-line entry each. */
const listText = (tasks, now) => {
	if (tasks.length === 0) return `No \`${BG_RUN}\` tasks in this session.`;
	const running = tasks.filter((task) => isRunning(task.state)).length;
	return [`${tasks.length} task${tasks.length === 1 ? "" : "s"} in this session (${running} running):`, ...tasks.flatMap((task) => [`#${task.id} ${stateText(task)} ${secondsOf(task, now)}s ${JSON.stringify(task.name)}${task.pid === null ? "" : ` pid ${task.pid}`}`, `  log: ${task.path}`])].join("\n");
};
/** One task in full: where it runs, what it ran, and the end of its log. */
const detailText = (task, tail, now) => {
	return [
		`#${task.id} ${JSON.stringify(task.name)} ${stateText(task)} after ${secondsOf(task, now)}s`,
		...[
			`log: ${task.path}`,
			...task.pid === null ? [] : [`pid: ${task.pid} (its process group's leader)`],
			...task.error === void 0 ? [] : [`error: ${task.error}`],
			`cwd: ${task.cwd}`,
			`command: ${commandLine(task.command)}`
		],
		`last ${TAIL.lines} lines:`,
		...tailLines(tail)
	].join("\n");
};

// src/lib/tasks.ts
/**
* This session's background tasks: the processes it started, their logs, and
* the state another extension follows.
*
* An ending task is announced to `notify`, which only ever reports it: nothing
* here starts a turn, so a build that finishes hours later cannot wake an agent
* that has moved on. `wait` is how an agent asks for the result, and its signal
* cancels the wait alone — never the process.
*
* The operating system is injected (`spawn`, `readLog`, `now`, `setTimer`), so
* the lifecycle can be tested without one.
*/
const abortError = (id, task) => {
	const error = /* @__PURE__ */ new Error(`${BG_WAIT}: stopped waiting for #${id}; it is still running${task.pid === null ? "" : ` (pid ${task.pid})`}. Log: ${task.path}`);
	error.name = "AbortError";
	return error;
};
function createTasks(deps) {
	const entries = /* @__PURE__ */ new Map();
	const graceMs = deps.graceMs ?? 5e3;
	const shutdownGraceMs = deps.shutdownGraceMs ?? 1e3;
	let next = 1;
	let sequence = 0;
	let closed = false;
	const view = (task) => ({
		id: task.id,
		name: task.name,
		pid: task.pid,
		path: task.path,
		cwd: task.cwd,
		command: task.command,
		state: task.state,
		code: task.code,
		signal: task.signal,
		startedAt: task.startedAt,
		finishedAt: task.finishedAt
	});
	const snapshotOf = (type = "snapshot") => ({
		protocol: 1,
		sessionId: deps.sessionId,
		instanceId: deps.instanceId,
		sequence: sequence += 1,
		type,
		tasks: type === "stopped" ? [] : [...entries.values()].map((entry) => view(entry.task))
	});
	/** Publishes a change, unless the session has ended: nothing may resurrect a stopped snapshot. */
	const publish = () => {
		if (!closed) deps.publish(snapshotOf());
	};
	const readTail = (task) => {
		try {
			return tailOfLog(deps.readLog(task.path, TAIL.bytes), TAIL);
		} catch (error) {
			return {
				text: `(log unreadable: ${error instanceof Error ? error.message : String(error)})`,
				truncated: false
			};
		}
	};
	const signal = (entry, how) => {
		entry.process?.kill(how);
	};
	const escalate = (entry, budgetMs = graceMs) => {
		entry.cancelEscalation?.();
		entry.cancelEscalation = deps.setTimer(() => {
			entry.cancelEscalation = void 0;
			if (entry.done) return;
			signal(entry, "SIGKILL");
		}, budgetMs);
	};
	/** SIGTERM now, and the kill that follows if it is still there after the grace. */
	const beginStop = (entry) => {
		entry.cancelTimeout?.();
		entry.cancelTimeout = void 0;
		entry.task.state = "stopping";
		signal(entry, "SIGTERM");
		escalate(entry);
	};
	const end = (entry, exit) => {
		if (entry.done) return;
		entry.done = true;
		const { task } = entry;
		task.state = "exited";
		task.code = exit.code;
		task.signal = exit.signal;
		task.finishedAt = deps.now();
		entry.cancelEscalation?.();
		entry.cancelEscalation = void 0;
		entry.cancelTimeout?.();
		entry.cancelTimeout = void 0;
		const tail = readTail(task);
		const waiters = [...entry.waiters];
		entry.waiters.clear();
		for (const waiter of waiters) waiter.end({
			kind: "ended",
			task,
			tail
		});
		if (closed) return;
		deps.publish(snapshotOf());
		deps.notify({
			task,
			tail
		});
	};
	const lookup = (id) => {
		const entry = entries.get(id);
		if (!entry) throw new Error(`bg: #${id} is not a task of this session; \`${BG_STATUS}\` lists them.`);
		return entry;
	};
	const run = async (input) => {
		if (closed) throw new Error("bg: the session has ended");
		const id = next++;
		const cwd = input.cwd ?? deps.cwd;
		const task = {
			id,
			name: input.name?.trim() || (input.command.split("\n")[0] ?? "").trim().slice(0, 60) || `#${id}`,
			pid: null,
			path: deps.logPath(id),
			cwd,
			command: input.command,
			state: "running",
			code: null,
			signal: null,
			startedAt: deps.now(),
			finishedAt: null
		};
		const entry = {
			task,
			done: false,
			waiters: /* @__PURE__ */ new Set()
		};
		entries.set(id, entry);
		let process;
		try {
			process = await deps.spawn(input.command, {
				cwd,
				logPath: task.path
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			task.state = "failed";
			task.error = message;
			task.finishedAt = deps.now();
			entry.done = true;
			publish();
			throw new Error(`bg_run: #${id} could not start: ${message}`);
		}
		if (closed) {
			entry.process = process;
			task.pid = process.pid;
			signal(entry, "SIGTERM");
			escalate(entry, shutdownGraceMs);
			process.exited.then((exit) => end(entry, exit));
			throw new Error(`bg: #${id} started just as the session ended, and was stopped`);
		}
		entry.process = process;
		task.pid = process.pid;
		if (input.timeoutMs !== void 0) entry.cancelTimeout = deps.setTimer(() => {
			entry.cancelTimeout = void 0;
			if (entry.done) return;
			beginStop(entry);
			publish();
		}, input.timeoutMs);
		publish();
		process.exited.then((exit) => end(entry, exit));
		return task;
	};
	const stop = (id) => {
		const entry = lookup(id);
		const { task } = entry;
		if (entry.done) throw new Error(`#${id} already ended (${task.code ?? task.signal ?? "failed"}).`);
		if (!isRunning(task.state)) throw new Error(`#${id} is ${task.state}; nothing to stop.`);
		if (task.state === "stopping") {
			entry.cancelEscalation?.();
			entry.cancelEscalation = void 0;
			signal(entry, "SIGKILL");
			return {
				task,
				graceMs,
				escalated: true
			};
		}
		beginStop(entry);
		publish();
		return {
			task,
			graceMs,
			escalated: false
		};
	};
	const wait = (id, options = {}) => {
		const entry = lookup(id);
		const { task } = entry;
		const { signal: abort, timeoutMs } = options;
		if (entry.done) return Promise.resolve({
			kind: "ended",
			task,
			tail: readTail(task)
		});
		if (abort?.aborted) return Promise.reject(abortError(id, task));
		return new Promise((resolve, reject) => {
			let cancelTimer;
			let settled = false;
			const clean = () => {
				settled = true;
				entry.waiters.delete(waiter);
				cancelTimer?.();
				abort?.removeEventListener("abort", onAbort);
			};
			const waiter = {
				end(outcome) {
					if (settled) return;
					clean();
					resolve(outcome);
				},
				fail(error) {
					if (settled) return;
					clean();
					reject(error);
				}
			};
			const onAbort = () => waiter.fail(abortError(id, task));
			entry.waiters.add(waiter);
			abort?.addEventListener("abort", onAbort, { once: true });
			if (timeoutMs !== void 0) cancelTimer = deps.setTimer(() => {
				cancelTimer = void 0;
				waiter.end({
					kind: "timeout",
					task,
					tail: readTail(task)
				});
			}, timeoutMs);
		});
	};
	/** Resolves once every one of `pending` has ended, or when the budget runs out. */
	const settle = (pending, budgetMs) => new Promise((resolve) => {
		const open = pending.filter((entry) => !entry.done);
		let left = open.length;
		let finished = false;
		let cancelBudget;
		const stop = () => {
			if (finished) return;
			finished = true;
			cancelBudget?.();
			for (const entry of open) entry.waiters.delete(waiter);
			resolve();
		};
		const waiter = {
			end: () => {
				left -= 1;
				if (left === 0) stop();
			},
			fail: () => {}
		};
		if (left === 0) {
			stop();
			return;
		}
		for (const entry of open) entry.waiters.add(waiter);
		cancelBudget = deps.setTimer(stop, budgetMs);
	});
	const dispose = async () => {
		if (closed) return;
		closed = true;
		const ended = /* @__PURE__ */ new Error("bg: the session ended while waiting");
		const stopping = [...entries.values()];
		for (const entry of stopping) {
			if (!entry.done) {
				entry.cancelTimeout?.();
				entry.cancelTimeout = void 0;
				entry.cancelEscalation?.();
				entry.cancelEscalation = void 0;
				entry.task.state = "stopping";
				signal(entry, "SIGTERM");
			}
			for (const waiter of entry.waiters) waiter.fail(ended);
			entry.waiters.clear();
		}
		deps.publish(snapshotOf("stopped"));
		entries.clear();
		const pending = stopping.filter((entry) => !entry.done && entry.process !== void 0);
		if (pending.length === 0) return;
		await settle(pending, shutdownGraceMs);
		const stubborn = pending.filter((entry) => !entry.done);
		for (const entry of stubborn) signal(entry, "SIGKILL");
		if (stubborn.length > 0) await settle(stubborn, 250);
	};
	return {
		run,
		stop,
		wait,
		get: (id) => lookup(id).task,
		list: () => [...entries.values()].map((entry) => entry.task),
		tail: (id) => readTail(lookup(id).task),
		snapshot: () => snapshotOf(),
		dispose
	};
}

// src/pi/node.ts
/** A session id as a folder name: readable, and nothing a path has to escape. */
const slug = (sessionId) => sessionId.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 40) || "session";
/**
* This instance's log folder, made on first use: `mkdtemp` gives a fresh
* private (0700) folder, so two sessions never read each other's logs and a
* reloaded one cannot reopen a file its transcript still points at. The folder
* and the logs outlive the session, which is what makes them readable after it.
*/
const logPaths = (sessionId) => {
	let dir;
	return (id) => {
		dir ??= mkdtempSync(join(tmpdir(), `pi-bg-${slug(sessionId)}-`));
		return join(dir, `${id}.log`);
	};
};
const instanceId = () => randomUUID();
/**
* Starts `bash -c` detached in `cwd`, its output going to `logPath`. Detached,
* so the task leads its own process group and one kill takes its children with
* it. The child stays referenced, so a task still running holds pi open until
* it ends — which is also what lets a stop's unref'd kill timer fire — and a
* shutdown's SIGTERM is what lets pi exit.
*/
const spawnDetached = (command, options) => new Promise((resolve, reject) => {
	let fd;
	try {
		fd = openSync(options.logPath, "wx", 384);
	} catch (error) {
		reject(error);
		return;
	}
	let child;
	try {
		child = spawn("bash", ["-c", command], {
			cwd: options.cwd,
			detached: true,
			stdio: [
				"ignore",
				fd,
				fd
			]
		});
	} catch (error) {
		reject(error);
		return;
	} finally {
		try {
			closeSync(fd);
		} catch {}
	}
	child.on("error", () => {});
	child.once("error", (error) => reject(error));
	const exited = new Promise((done) => {
		child.once("exit", (code, signal) => done({
			code,
			signal
		}));
	});
	child.once("spawn", () => {
		const pid = child.pid;
		if (pid === void 0) {
			reject(/* @__PURE__ */ new Error("bash started without a pid"));
			return;
		}
		resolve({
			pid,
			exited,
			kill: (signal) => {
				try {
					process.kill(-pid, signal);
				} catch {}
			}
		});
	});
});
/** At most `maxBytes` from the end of a log, and whether the front was cut off. */
const readLogTail = (path, maxBytes) => {
	const fd = openSync(path, "r");
	try {
		const size = fstatSync(fd).size;
		const start = Math.max(0, size - maxBytes);
		const buffer = Buffer.alloc(size - start);
		readSync(fd, buffer, 0, buffer.length, start);
		return {
			bytes: new Uint8Array(buffer),
			cut: start > 0
		};
	} finally {
		closeSync(fd);
	}
};
/** A timer that never holds pi open: a stop's kill must not outlive the session. */
const setUnrefTimer = (run, ms) => {
	const timer = setTimeout(run, ms);
	timer.unref();
	return () => clearTimeout(timer);
};

// src/pi.ts
/**
* Shell commands that outlive the tool call that started them: `bg_run` starts
* one detached, `bg_wait` waits for it, `bg_status` shows the session's tasks
* and `bg_stop` ends one.
*
* Nothing here wakes the agent. A task that ends sends one passive message — a
* custom message with `triggerTurn: false` and no `deliverAs`, which pi stores
* and draws and never turns into a run, idle or mid-turn — so the agent asks
* `bg_wait` when it wants the result, and a build that ends after it has moved
* on costs nothing. `bg_wait`'s own signal cancels the wait alone; the process
* keeps running.
*
* Tasks belong to the session that started them: a shutdown (exit, `/new`,
* `/reload`, a worktree move) kills them, ends their timers and stops their
* waits, and a late exit reaches nothing. Every change is also published on
* pi's event bus as one snapshot (`bg:state`), which is how Herdr's child
* terminals follow them without this package knowing they exist.
*/
/** How long `bg_wait` waits before it hands back a task that is still running. */
const WAIT_SECONDS = 30;
const now = () => Date.now();
function pi_default(pi) {
	let live;
	const publish = (snapshot) => pi.events.emit(BG_STATE, snapshot);
	pi.events.on(BG_STATE_REQUEST, () => {
		if (live) publish(live.tasks.snapshot());
	});
	const tasksOf = () => {
		if (!live) throw new Error("bg: no session is running this extension");
		return live.tasks;
	};
	pi.on("session_start", (_event, ctx) => {
		live?.tasks.dispose();
		const sessionId = ctx.sessionManager.getSessionId();
		const tasks = createTasks({
			sessionId,
			instanceId: instanceId(),
			cwd: ctx.cwd,
			logPath: logPaths(sessionId),
			spawn: spawnDetached,
			readLog: readLogTail,
			now,
			setTimer: setUnrefTimer,
			publish,
			notify: ({ task, tail }) => {
				pi.sendMessage({
					customType: "bg-done",
					display: true,
					content: endText(task, tail, now()),
					details: {
						id: task.id,
						pid: task.pid,
						path: task.path,
						code: task.code,
						signal: task.signal
					}
				}, { triggerTurn: false });
			}
		});
		live = { tasks };
		publish(tasks.snapshot());
	});
	pi.on("session_shutdown", async () => {
		const gone = live;
		live = void 0;
		await gone?.tasks.dispose();
	});
	pi.registerTool({
		name: BG_RUN,
		label: "Background",
		description: `Run a shell command detached in the cwd and return at once, for builds and tests that outlast a tool call. It never wakes you when it ends: call \`${BG_WAIT}\` with its id to wait for the exit code and last ${TAIL.lines} lines, \`${BG_STATUS}\` to see the session's tasks, or \`${BG_STOP}\` to end it.`,
		promptSnippet: "Run a long command in the background; wait for it with bg_wait.",
		parameters: Type.Object({
			command: Type.String({ description: "Bash command line" }),
			name: Type.Optional(Type.String({ description: "Short label for status and wait output" })),
			timeoutSeconds: Type.Optional(Type.Integer({
				minimum: 1,
				maximum: 86400,
				description: `End it this long after it starts, as \`${BG_STOP}\` would. Default: run until it ends or is stopped.`
			}))
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const task = await tasksOf().run({
				command: params.command,
				name: params.name,
				cwd: ctx.cwd,
				...params.timeoutSeconds === void 0 ? {} : { timeoutMs: params.timeoutSeconds * 1e3 }
			});
			return {
				content: [{
					type: "text",
					text: startText(task)
				}],
				details: {
					id: task.id,
					pid: task.pid,
					path: task.path
				}
			};
		}
	});
	pi.registerTool({
		name: BG_WAIT,
		label: "Wait for background",
		description: `Wait for a ${BG_RUN} task of this session to end, and return its exit code and the last ${TAIL.lines} lines of its output. Stops waiting after ${WAIT_SECONDS} seconds by default and says the task is still running, so call it again to keep waiting. Aborting the wait leaves the process running.`,
		promptSnippet: "Wait for a background task to end and read its result.",
		parameters: Type.Object({
			id: Type.Integer({
				minimum: 1,
				description: `The id ${BG_RUN} returned`
			}),
			timeoutSeconds: Type.Optional(Type.Integer({
				minimum: 1,
				maximum: 86400,
				description: `Give up after this long and return what the log holds now. Default: ${WAIT_SECONDS}.`
			}))
		}),
		async execute(_toolCallId, params, signal) {
			const outcome = await tasksOf().wait(params.id, {
				signal,
				timeoutMs: (params.timeoutSeconds ?? WAIT_SECONDS) * 1e3
			});
			const ended = outcome.kind === "ended";
			return {
				content: [{
					type: "text",
					text: ended ? endText(outcome.task, outcome.tail, now()) : timeoutText(outcome.task, outcome.tail, now())
				}],
				details: {
					id: outcome.task.id,
					state: outcome.task.state,
					code: outcome.task.code,
					signal: outcome.task.signal,
					path: outcome.task.path,
					timedOut: !ended
				}
			};
		}
	});
	pi.registerTool({
		name: BG_STATUS,
		label: "Background status",
		description: `List this session's ${BG_RUN} tasks with their state, or take one id for its log's tail and how it runs.`,
		promptSnippet: "See the background tasks of this session.",
		parameters: Type.Object({ id: Type.Optional(Type.Integer({
			minimum: 1,
			description: "One task, in full"
		})) }),
		async execute(_toolCallId, params) {
			const tasks = tasksOf();
			const all = tasks.list();
			const task = params.id === void 0 ? void 0 : tasks.get(params.id);
			return {
				content: [{
					type: "text",
					text: task === void 0 ? listText(all, now()) : detailText(task, tasks.tail(task.id), now())
				}],
				details: {
					id: task?.id,
					count: all.length
				}
			};
		}
	});
	pi.registerTool({
		name: BG_STOP,
		label: "Stop background",
		description: `End a ${BG_RUN} task of this session: SIGTERM to its process group, then SIGKILL if it is still there after the grace. Never signals a pid you type.`,
		promptSnippet: "Stop a background task of this session.",
		parameters: Type.Object({ id: Type.Integer({
			minimum: 1,
			description: `The id ${BG_RUN} returned`
		}) }),
		async execute(_toolCallId, params) {
			const outcome = tasksOf().stop(params.id);
			const { task } = outcome;
			return {
				content: [{
					type: "text",
					text: outcome.escalated ? `#${task.id} got SIGKILL: it had not exited ${Math.round(outcome.graceMs / 1e3)}s after SIGTERM. Log: ${task.path}` : `#${task.id} stopping: SIGTERM sent to its process group, SIGKILL in ${Math.round(outcome.graceMs / 1e3)}s unless it exits. \`${BG_WAIT}\` with \`{"id":${task.id}}\` returns when it is gone. Log: ${task.path}`
				}],
				details: {
					id: task.id,
					pid: task.pid,
					state: task.state,
					escalated: outcome.escalated
				}
			};
		}
	});
}

export { pi_default as default };