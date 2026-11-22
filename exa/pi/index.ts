import { Type } from "typebox";
import { readFileSync } from "node:fs";

// src/lib/budget.ts
/**
* How much of the model's context one Exa call may add, and how that is split across results or
* pages. Sizes are characters, at four to a token.
*/
const WINDOW_SHARE = .06;
const FREE_SHARE = .25;
const MIN_TOTAL_CHARS = 4e3;
const MAX_TOTAL_CHARS = 12e4;
const DEFAULT_SEARCH_CHARS = 8e3;
const MAX_PAGE_CHARS = 3e4;
const MIN_PAGE_CHARS = 1500;
/**
* Total chars one call may add to the context, and the window it was reckoned from. `tokens` is
* what the context already holds, unknown when null or missing: half the window is then taken as free.
*/
function contextBudget(window, tokens) {
	const free = tokens == null ? window / 2 : Math.max(0, window - tokens);
	const share = Math.min(window * WINDOW_SHARE, free * FREE_SHARE) * 4;
	return {
		window,
		total: Math.min(MAX_TOTAL_CHARS, Math.max(MIN_TOTAL_CHARS, Math.floor(share)))
	};
}
/** How many results a search asks for by default: fewer on a small window. */
const resultCount = (window) => window >= 5e5 ? 10 : window >= 15e4 ? 8 : window >= 64e3 ? 5 : 3;
/** The per-result cap of a search: `maxChars` or the default, never more than an even share of `total`. */
const searchCap = (total, numResults, maxChars) => Math.max(1, Math.min(maxChars ?? 8e3, Math.floor(total / numResults)));
/**
* How a fetch of `urlCount` pages fits `total`: how many pages it reads, and the cap on each. A
* page is read in at least `MIN_PAGE_CHARS`, so a small budget reads fewer pages rather than
* cutting every one to nothing.
*/
function fetchPlan(total, urlCount, maxChars) {
	const pageCap = Math.max(1, Math.min(maxChars ?? 3e4, MAX_PAGE_CHARS));
	const maxPages = Math.max(1, Math.min(urlCount, Math.floor(total / Math.min(pageCap, MIN_PAGE_CHARS))));
	return {
		maxPages,
		perPage: Math.max(1, Math.min(pageCap, Math.floor(total / maxPages)))
	};
}

// src/pi.ts
/**
* Exa search and page fetch. Both cap the whole call to a share of the active
* model's context, split across results or pages, so the tools stay usable on
* small windows; `maxChars` only moves the per-item cap.
*/
const API = "https://api.exa.ai";
const fee = (costUsd) => costUsd !== void 0 && costUsd > 0 ? { usage: {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 0,
	cost: {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		total: costUsd
	}
} } : {};
/** Total chars one call may add to the context, and the window used for result counts. */
function budgetOf(ctx) {
	const usage = ctx.getContextUsage();
	return contextBudget(usage?.contextWindow ?? ctx.model?.contextWindow ?? 2e5, usage?.tokens);
}
let apiKey;
/** The key from `$PI_EXA_KEY_FILE`, read on first use and cached; throws when unset, unreadable or empty. */
function exaKey() {
	if (apiKey) return apiKey;
	const file = process.env.PI_EXA_KEY_FILE;
	if (!file) throw new Error("PI_EXA_KEY_FILE is unset (secret: exa-api-key).");
	let key;
	try {
		key = readFileSync(file, "utf8").trim();
	} catch (err) {
		throw new Error(`Can't read the Exa key (secret: exa-api-key): ${err.message}`);
	}
	if (!key) throw new Error(`The Exa key file ${file} is empty (secret: exa-api-key).`);
	return apiKey = key;
}
async function post(path, body, signal) {
	const res = await fetch(`${API}${path}`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"x-api-key": exaKey()
		},
		body: JSON.stringify(body),
		signal
	});
	if (!res.ok) {
		const detail = (await res.text()).slice(0, 300);
		throw new Error(`Exa ${path} HTTP ${res.status}: ${detail}`);
	}
	return await res.json();
}
/** `contents` for one mode. `cap` is the share of the call budget for this item. */
function contents(mode, cap, query) {
	if (mode === "text") return { text: { maxCharacters: cap } };
	if (mode === "summary") return { summary: { query } };
	return { highlights: { maxCharacters: cap } };
}
const excerpt = (r) => {
	return r.highlights?.join("\n…\n").trim() || r.text || r.summary || "";
};
/** One block per result: rank, title, bare URL for copying, then the evidence. */
function format(results, numbered) {
	return results.map((r, i) => {
		return `${[numbered ? `[${i + 1}]` : "", r.title ?? ""].filter(Boolean).join(" ")}${r.publishedDate ? ` (${r.publishedDate.slice(0, 10)})` : ""}\n${r.url ?? ""}\n${excerpt(r)}`;
	}).join("\n\n");
}
function truncatedUrl(r, mode, cap) {
	return (mode === "text" ? (r.text?.length ?? 0) >= cap : mode === "highlights" ? (r.highlights?.join("").length ?? 0) >= cap : false) ? r.url : void 0;
}
function shortList(items) {
	return items.length <= 4 ? items.join(", ") : `${items.slice(0, 3).join(", ")} and ${items.length - 3} more`;
}
const footer = (notes) => notes.length > 0 ? `\n\n[${notes.join("; ")}]` : "";
const modeParam = (fallback, detail) => Type.Optional(Type.Union([
	Type.Literal("highlights"),
	Type.Literal("text"),
	Type.Literal("summary")
], { description: `${detail} Defaults to "${fallback}".` }));
const capParam = (detail) => Type.Optional(Type.Number({
	minimum: 1,
	description: detail
}));
function pi_default(pi) {
	pi.registerTool({
		name: "exa_search",
		label: "Exa search",
		description: "Search the web through Exa for passages that answer the query. Use it for anything outside the repo: current docs, APIs, releases, error messages, news.",
		promptSnippet: "Search the web for passages that answer a query.",
		parameters: Type.Object({
			query: Type.String({ description: "Describe the page you want in plain language, not keywords." }),
			objective: Type.String({ description: "Which pages should rank first or be left out, and which facts to pull from them." }),
			mode: modeParam("highlights", "Per result: \"highlights\" (excerpts for the query), \"text\" (page body) or \"summary\" (LLM digest)."),
			numResults: Type.Optional(Type.Number({
				minimum: 1,
				maximum: 100,
				description: "Defaults to 3-10 by context window; more results means shorter excerpts."
			})),
			maxChars: capParam("Per-result character cap. Defaults to an even share of the call budget."),
			includeDomains: Type.Optional(Type.Array(Type.String(), { description: "Only search these domains." })),
			startPublishedDate: Type.Optional(Type.String({ description: "ISO date; drops anything published earlier." }))
		}),
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const { window, total } = budgetOf(ctx);
			const mode = params.mode ?? "highlights";
			const numResults = params.numResults ?? resultCount(window);
			const cap = searchCap(total, numResults, params.maxChars);
			const data = await post("/search", {
				query: params.query,
				numResults,
				objective: params.objective,
				includeDomains: params.includeDomains,
				startPublishedDate: params.startPublishedDate,
				contents: contents(mode, cap, params.objective)
			}, signal);
			const results = data.results ?? [];
			const costUsd = data.costDollars?.total;
			const truncated = results.map((r) => truncatedUrl(r, mode, cap)).filter((url) => Boolean(url));
			if (results.length === 0) return {
				content: [{
					type: "text",
					text: `No results for "${params.query}".`
				}],
				details: {
					numResults,
					mode,
					costUsd,
					truncated: []
				},
				...fee(costUsd)
			};
			const notes = truncated.length > 0 ? [`Capped at ~${cap} chars: ${shortList(truncated)}`] : [];
			return {
				content: [{
					type: "text",
					text: format(results, true) + footer(notes)
				}],
				details: {
					numResults,
					mode,
					costUsd,
					truncated
				},
				...fee(costUsd)
			};
		}
	});
	pi.registerTool({
		name: "exa_fetch",
		label: "Exa fetch",
		description: "Read the body of pages you have URLs for. Use it over curl for docs, READMEs and JS-heavy pages, which curl returns as markup.",
		promptSnippet: "Read the body of known URLs.",
		parameters: Type.Object({
			urls: Type.Array(Type.String(), {
				minItems: 1,
				maxItems: 100,
				description: "Pages to read."
			}),
			mode: modeParam("text", "Per page: \"text\" (page body), \"highlights\" (excerpts) or \"summary\" (LLM digest)."),
			maxChars: capParam("Per-page character cap; summary ignores it. Defaults to a share of the call budget."),
			maxAgeHours: Type.Optional(Type.Integer({
				minimum: -1,
				maximum: 720,
				description: "Oldest cached copy to accept, in hours: 0 always fetches fresh, -1 always uses the cache. Defaults to 24."
			}))
		}),
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const { total } = budgetOf(ctx);
			const mode = params.mode ?? "text";
			const { maxPages, perPage } = fetchPlan(total, params.urls.length, params.maxChars);
			const urls = params.urls.slice(0, maxPages);
			const skipped = params.urls.slice(maxPages);
			const data = await post("/contents", {
				urls,
				maxAgeHours: params.maxAgeHours ?? 24,
				...contents(mode, perPage, urls.join(" "))
			}, signal);
			const results = (data.results ?? []).filter((r) => r.url);
			const costUsd = data.costDollars?.total;
			const failed = (data.statuses ?? []).filter((s) => s.status !== "success").map((s) => `${s.id} (${s.status})`);
			const truncated = results.map((r) => truncatedUrl(r, mode, perPage)).filter((url) => Boolean(url));
			const notes = [
				...truncated.length > 0 ? [`Capped at ~${perPage} chars: ${shortList(truncated)}`] : [],
				...skipped.length > 0 ? [`Skipped (context budget): ${shortList(skipped)}`] : [],
				...failed.length > 0 ? [`Failed: ${shortList(failed)}`] : []
			];
			if (results.length === 0) return {
				content: [{
					type: "text",
					text: `Nothing extracted.${footer(notes)}`
				}],
				details: {
					mode,
					costUsd,
					truncated,
					skipped,
					failed
				},
				...fee(costUsd)
			};
			return {
				content: [{
					type: "text",
					text: format(results, false) + footer(notes)
				}],
				details: {
					mode,
					pages: results.length,
					costUsd,
					truncated,
					skipped,
					failed
				},
				...fee(costUsd)
			};
		}
	});
}

export { pi_default as default };