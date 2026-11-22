import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

// src/pi/aliases.ts
/**
* Claude Code's slash habits in pi, which matches built-in slash commands by
* exact name, so muscle memory from other agents would land as a prompt.
*/
const SKILL_TOKEN = /(?<=^|\s)\/(?:skill:)?([a-z0-9-]+)(?:$|[\s.,;:!?)])/g;
function aliases_default(pi) {
	pi.registerCommand("clear", {
		description: "Start a new session (alias for /new)",
		handler: async (_args, ctx) => {
			await ctx.newSession();
		}
	});
	pi.registerCommand("effort", {
		description: "Set the thinking level: /effort <level>. Without one, show it and the allowed levels",
		handler: async (args, ctx) => {
			if (!ctx.model) {
				ctx.ui.notify("No model selected", "warning");
				return;
			}
			const allowed = getSupportedThinkingLevels(ctx.model);
			const wanted = args.trim().toLowerCase();
			const level = allowed.find((l) => l === wanted);
			if (!level) {
				const refused = wanted ? `No "${wanted}" effort on this model. ` : "";
				ctx.ui.notify(`${refused}Effort: ${pi.getThinkingLevel()} (allowed: ${allowed.join(", ")})`, refused ? "warning" : "info");
				return;
			}
			pi.setThinkingLevel(level);
			ctx.ui.notify(`Effort: ${level}`, "info");
		}
	});
	pi.on("input", (event) => {
		if (event.source === "extension" || event.text.startsWith("/skill:")) return;
		const commands = pi.getCommands();
		const first = event.text.match(/^\/(\S+)/)?.[1];
		if (commands.some((c) => c.source === "prompt" && c.name === first)) return;
		const skills = new Set(commands.filter((c) => c.source === "skill").map((c) => c.name.slice(6)));
		const token = [...event.text.matchAll(SKILL_TOKEN)].find((m) => skills.has(m[1] ?? ""));
		if (!token) return;
		return {
			action: "transform",
			text: token.index === 0 ? `/skill:${token[1]} ${event.text.slice(token[0].length)}` : `/skill:${token[1]} ${event.text}`
		};
	});
}

// src/pi/stash.ts
/**
* Claude Code's ctrl+s prompt stash: ctrl+s parks the draft and clears the
* editor, ctrl+s on an empty editor restores it, and submitting a prompt
* restores it too.
*
* The stash is saved in one file per repository, keyed by its main checkout so a
* worktree shares it, and so outlives /new, /clear, /resume, /fork, /reload and
* the process itself.
*/
const WIDGET_KEY = "stash";
const PREVIEW_CHARS = 60;
const preview = (text) => {
	const line = text.trim().split("\n")[0] ?? "";
	return line.length > PREVIEW_CHARS ? `${line.slice(0, PREVIEW_CHARS)}…` : line;
};
const hasEditor = (ctx) => ctx.mode === "tui" && ctx.hasUI;
const real = (path) => {
	try {
		return realpathSync(path);
	} catch {
		return path;
	}
};
const git = (cwd, args) => {
	try {
		return execFileSync("git", args, {
			cwd,
			encoding: "utf8",
			timeout: 5e3,
			stdio: [
				"ignore",
				"pipe",
				"ignore"
			]
		}).trim();
	} catch {
		return;
	}
};
/** Main checkout of `cwd`, shared by every worktree of a repository; unset outside git. */
const gitMain = (cwd) => {
	const [top, common] = git(cwd, [
		"rev-parse",
		"--path-format=absolute",
		"--show-toplevel",
		"--git-common-dir"
	])?.split("\n") ?? [];
	if (!top) return void 0;
	return real(common && basename(common) === ".git" ? dirname(common) : top);
};
const fileFor = (cwd) => {
	const root = gitMain(cwd) ?? real(cwd);
	const key = createHash("sha256").update(root).digest("hex").slice(0, 16);
	return join(getAgentDir(), "prompt-stash", `${key}.json`);
};
const readStash = (path) => {
	try {
		const parsed = JSON.parse(readFileSync(path, "utf8"));
		return typeof parsed.text === "string" && typeof parsed.at === "string" ? {
			text: parsed.text,
			at: parsed.at
		} : void 0;
	} catch {
		return;
	}
};
const writeStash = (path, stash) => {
	try {
		if (!stash) return rmSync(path, { force: true });
		mkdirSync(dirname(path), { recursive: true });
		const tmp = `${path}.${process.pid}.tmp`;
		writeFileSync(tmp, `${JSON.stringify(stash, null, 2)}\n`);
		renameSync(tmp, path);
	} catch {}
};
function stash_default(pi) {
	let stash;
	let file;
	const show = (ctx) => {
		ctx.ui.setWidget(WIDGET_KEY, stash === void 0 ? void 0 : [ctx.ui.theme.fg("dim", `stashed (ctrl+s restores): ${preview(stash.text)}`)]);
	};
	const park = (text) => {
		if (!file) return;
		stash = text === void 0 ? void 0 : {
			text,
			at: (/* @__PURE__ */ new Date()).toISOString()
		};
		writeStash(file, stash);
	};
	pi.on("session_start", (_event, ctx) => {
		if (!hasEditor(ctx)) return;
		file = fileFor(ctx.sessionManager.getCwd());
		stash = readStash(file);
		show(ctx);
	});
	pi.registerShortcut("ctrl+s", {
		description: "Stash the prompt until the next submit",
		handler: (ctx) => {
			const text = ctx.ui.getEditorText();
			if (text.trim()) {
				ctx.ui.setEditorText(stash?.text ?? "");
				park(text);
			} else if (stash) {
				ctx.ui.setEditorText(stash.text);
				park(void 0);
			}
			show(ctx);
		}
	});
	pi.on("input", (event, ctx) => {
		if (!hasEditor(ctx) || event.source !== "interactive" || !stash) return;
		if (ctx.ui.getEditorText().trim()) return;
		ctx.ui.setEditorText(stash.text);
		park(void 0);
		show(ctx);
	});
}

// src/pi.ts
function pi_default(pi) {
	for (const feature of [aliases_default, stash_default]) try {
		feature(pi);
	} catch (error) {
		pi.on("session_start", (_event, ctx) => {
			ctx.ui.notify(`claude-compat failed to load: ${error instanceof Error ? error.message : String(error)}`, "error");
		});
	}
}

export { pi_default as default };