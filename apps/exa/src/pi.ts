/**
 * Exa search and page fetch. Both cap the whole call to a share of the active
 * model's context, split across results or pages, so the tools stay usable on
 * small windows; `maxChars` only moves the per-item cap.
 */
import { Type } from "typebox";
import type { ExtensionAPI, ExtensionToolContext } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import { contextBudget, fetchPlan, fixedHighlights, resultCount, searchCap } from "./lib/budget.ts";
import { type ExaRemark, noticeLines, warningMessages } from "./lib/notices.ts";
import { withRetries } from "./lib/retry.ts";

const API = "https://api.exa.ai";
// Exa's fee as tool-result usage, which pi counts in the session total even under codemode.
const fee = (costUsd: number | undefined) =>
  costUsd !== undefined && costUsd > 0
    ? {
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: costUsd },
        },
      }
    : {};

type Mode = "highlights" | "text" | "summary";

interface ExaResult {
  title?: string;
  url?: string;
  publishedDate?: string;
  text?: string;
  summary?: string;
  highlights?: string[];
}

interface ExaStatus {
  id: string;
  status: string;
}

interface ExaResponse {
  results?: ExaResult[];
  statuses?: ExaStatus[];
  costDollars?: { total?: number };
  notices?: ExaRemark[];
  warnings?: ExaRemark[];
}

/** Total chars one call may add to the context, and the window used for result counts. */
function budgetOf(ctx: ExtensionToolContext) {
  const usage = ctx.getContextUsage();
  return contextBudget(usage?.contextWindow ?? ctx.model?.contextWindow ?? 200_000, usage?.tokens);
}

let apiKey: string | undefined;

/** The key from `$PI_EXA_KEY_FILE`, read on first use and cached; throws when unset, unreadable or empty. */
function exaKey(): string {
  if (apiKey) return apiKey;
  const file = process.env.PI_EXA_KEY_FILE;
  // Points at the agenix secret, so say what is missing rather than how to curl it.
  if (!file) throw new Error("PI_EXA_KEY_FILE is unset (secret: exa-api-key).");
  let key: string;
  try {
    key = readFileSync(file, "utf8").trim();
  } catch (err) {
    throw new Error(`Can't read the Exa key (secret: exa-api-key): ${(err as Error).message}`);
  }
  if (!key) throw new Error(`The Exa key file ${file} is empty (secret: exa-api-key).`);
  return (apiKey = key);
}

async function post<T extends ExaResponse>(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const init = {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": exaKey() },
    body: JSON.stringify(body),
  };
  let res: Response;
  try {
    res = await withRetries(
      (attempt) => fetch(`${API}${path}`, { ...init, signal: attempt }),
      signal,
    );
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new Error(`Exa ${path}: ${(err as Error).message}`);
  }
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    throw new Error(`Exa ${path} HTTP ${res.status}: ${detail}`);
  }
  return (await res.json()) as T;
}

/**
 * `contents` for one mode. `cap` is the share of the call budget for this item; with `fixed`
 * unset, highlights are left for Exa to size by relevance and only cut here. `query` is what
 * highlights and summaries pick for.
 */
function contents(mode: Mode, cap: number, fixed: boolean, query?: string) {
  if (mode === "text") return { text: { maxCharacters: cap } };
  if (mode === "summary") return { summary: query ? { query } : true };
  const highlights = { ...(query ? { query } : {}), ...(fixed ? { maxCharacters: cap } : {}) };
  return { highlights: Object.keys(highlights).length > 0 ? highlights : true };
}

const excerpt = (r: ExaResult) => {
  const highlights = r.highlights?.join("\n…\n").trim();
  return highlights || r.text || r.summary || "";
};

/** One block per result: rank, title, bare URL for copying, then the evidence cut to `cap`. */
function format(results: ExaResult[], numbered: boolean, cap: number) {
  return results
    .map((r, i) => {
      const head = [numbered ? `[${i + 1}]` : "", r.title ?? ""].filter(Boolean).join(" ");
      const date = r.publishedDate ? ` (${r.publishedDate.slice(0, 10)})` : "";
      return `${head}${date}\n${r.url ?? ""}\n${excerpt(r).slice(0, cap)}`;
    })
    .join("\n\n");
}

function truncatedUrl(r: ExaResult, mode: Mode, cap: number): string | undefined {
  const cut =
    mode === "text"
      ? (r.text?.length ?? 0) >= cap
      : mode === "highlights"
        ? (r.highlights?.join("").length ?? 0) >= cap
        : false;
  return cut ? r.url : undefined;
}

function shortList(items: string[]): string {
  return items.length <= 4
    ? items.join(", ")
    : `${items.slice(0, 3).join(", ")} and ${items.length - 3} more`;
}

const footer = (notes: string[]) => (notes.length > 0 ? `\n\n[${notes.join("; ")}]` : "");

const modeParam = (fallback: Mode, detail: string) =>
  Type.Optional(
    Type.Union([Type.Literal("highlights"), Type.Literal("text"), Type.Literal("summary")], {
      description: `${detail} Defaults to "${fallback}".`,
    }),
  );

const capParam = (detail: string) =>
  Type.Optional(Type.Number({ minimum: 1, description: detail }));

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "exa_search",
    label: "Exa search",
    description:
      "Search the web through Exa for passages that answer the query. Use it for anything outside the repo: current docs, APIs, releases, error messages, news.",
    promptSnippet: "Search the web for passages that answer a query.",
    parameters: Type.Object({
      query: Type.String({
        description: "Describe the page you want in plain language, not keywords.",
      }),
      objective: Type.String({
        description:
          "Goal for this search turn; say which documents should rank first, which should be excluded, and what specific facts or figures to pull from them.",
      }),
      mode: modeParam(
        "highlights",
        'Per result: "highlights" (excerpts for the query), "text" (page body) or "summary" (LLM digest).',
      ),
      numResults: Type.Optional(
        Type.Number({
          minimum: 1,
          maximum: 100,
          description: "Defaults to 3-10 by context window; more results means shorter excerpts.",
        }),
      ),
      maxChars: capParam("Per-result character cap. Defaults to an even share of the call budget."),
      includeDomains: Type.Optional(
        Type.Array(Type.String(), { description: "Only search these domains." }),
      ),
      startPublishedDate: Type.Optional(
        Type.String({ description: "ISO date; drops anything published earlier." }),
      ),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const { window, total } = budgetOf(ctx);
      const mode = params.mode ?? "highlights";
      const numResults = params.numResults ?? resultCount(window);
      const cap = searchCap(total, numResults, params.maxChars);
      const data = await post<ExaResponse>(
        "/search",
        {
          query: params.query,
          numResults,
          objective: params.objective,
          includeDomains: params.includeDomains,
          startPublishedDate: params.startPublishedDate,
          contents: contents(mode, cap, fixedHighlights(cap, params.maxChars), params.objective),
        },
        signal,
      );

      const results = data.results ?? [];
      const costUsd = data.costDollars?.total;
      const notices = noticeLines(data.notices);
      const lead = notices.length > 0 ? `${notices.join("\n")}\n\n` : "";
      const warnings = warningMessages(data.warnings);
      const truncated = results
        .map((r) => truncatedUrl(r, mode, cap))
        .filter((url): url is string => Boolean(url));

      if (results.length === 0) {
        return {
          content: [{ type: "text" as const, text: `${lead}No results for "${params.query}".` }],
          details: { numResults, mode, costUsd, truncated: [], warnings },
          ...fee(costUsd),
        };
      }
      const notes =
        truncated.length > 0 ? [`Capped at ~${cap} chars: ${shortList(truncated)}`] : [];
      return {
        content: [
          { type: "text" as const, text: lead + format(results, true, cap) + footer(notes) },
        ],
        details: { numResults, mode, costUsd, truncated, warnings },
        ...fee(costUsd),
      };
    },
  });

  pi.registerTool({
    name: "exa_fetch",
    label: "Exa fetch",
    description:
      "Read the body of pages you have URLs for. Use it over curl for docs, READMEs and JS-heavy pages, which curl returns as markup.",
    promptSnippet: "Read the body of known URLs.",
    parameters: Type.Object({
      urls: Type.Array(Type.String(), {
        minItems: 1,
        maxItems: 100,
        description: "Pages to read.",
      }),
      mode: modeParam(
        "text",
        'Per page: "text" (page body), "highlights" (excerpts) or "summary" (LLM digest).',
      ),
      maxChars: capParam(
        "Per-page character cap; summary ignores it. Defaults to a share of the call budget.",
      ),
      query: Type.Optional(
        Type.String({
          description:
            "What you want from the pages. Picks the highlights and focuses the summary; without it a summary is general.",
        }),
      ),
      maxAgeHours: Type.Optional(
        Type.Integer({
          minimum: -1,
          maximum: 720,
          description:
            "Oldest cached copy to accept, in hours: 0 always fetches fresh, -1 only uses the cache. By default a cached copy of any age is used and missing pages are fetched.",
        }),
      ),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const { total } = budgetOf(ctx);
      const mode = params.mode ?? "text";
      const { maxPages, perPage } = fetchPlan(total, params.urls.length, params.maxChars);
      const urls = params.urls.slice(0, maxPages);
      const skipped = params.urls.slice(maxPages);

      const data = await post<ExaResponse>(
        "/contents",
        {
          urls,
          maxAgeHours: params.maxAgeHours,
          ...contents(mode, perPage, fixedHighlights(perPage, params.maxChars), params.query),
        },
        signal,
      );

      const results = (data.results ?? []).filter((r) => r.url);
      const costUsd = data.costDollars?.total;
      const failed = (data.statuses ?? [])
        .filter((s) => s.status !== "success")
        .map((s) => `${s.id} (${s.status})`);
      const truncated = results
        .map((r) => truncatedUrl(r, mode, perPage))
        .filter((url): url is string => Boolean(url));
      const notes = [
        ...(truncated.length > 0 ? [`Capped at ~${perPage} chars: ${shortList(truncated)}`] : []),
        ...(skipped.length > 0 ? [`Skipped (context budget): ${shortList(skipped)}`] : []),
        ...(failed.length > 0 ? [`Failed: ${shortList(failed)}`] : []),
      ];

      if (results.length === 0) {
        return {
          content: [{ type: "text" as const, text: `Nothing extracted.${footer(notes)}` }],
          details: { mode, costUsd, truncated, skipped, failed },
          ...fee(costUsd),
        };
      }
      return {
        content: [{ type: "text" as const, text: format(results, false, perPage) + footer(notes) }],
        details: { mode, pages: results.length, costUsd, truncated, skipped, failed },
        ...fee(costUsd),
      };
    },
  });
}
