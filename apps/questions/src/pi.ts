/**
 * `ask_user_question`: put one to four structured questions to the user and
 * wait for the answers, so a decision the model cannot make alone comes back
 * as data rather than a conversation.
 *
 * The dialog lives in `./dialog.ts`. This file owns the contract: the schema the
 * model fills in, with its limits, and the non-TUI path.
 *
 * Sequential on purpose. Two questionnaires in the editor slot would replace
 * each other, and pi resolves that by running this tool's calls one at a time.
 */
import { Type } from "typebox";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { QuestionsDialog, isQuestionsDraft, type QuestionsDraft } from "./pi/dialog.ts";

import {
  HEADER_MAX,
  LABEL_MAX,
  MAX_OPTIONS,
  MAX_QUESTIONS,
  MIN_OPTIONS,
  type Question,
  type QuestionAnswer,
  type QuestionsResult,
  TOOL_NAME,
  TYPE_SOMETHING,
  validateQuestions,
} from "./pi/types.ts";

const DRAFT_ENTRY = "questions-draft";
interface PendingDraft {
  key: string;
  draft: QuestionsDraft;
}
interface QuestionLifecycle {
  saved?: QuestionsDraft;
  suspend(draft: QuestionsDraft): void;
  complete(): void;
  interrupt(close: (() => void) | undefined): void;
}

const DESCRIPTION = `Ask the user multiple-choice questions and wait for the answers. Use it when you can't proceed without the user's decision, with every question in one call. Each question already gets a "Type something." row and Esc, so don't write "Other" or "Type something." options. Put a recommended option first, its label ending in "(Recommended)". Give options a \`preview\` only to compare concrete artifacts such as mockups, code, diagrams or configs.`;

const OptionSchema = Type.Object({
  label: Type.String({ maxLength: LABEL_MAX, description: "1-5 words; the row the user picks." }),
  description: Type.Optional(Type.String({ description: "One line of context under the label." })),
  preview: Type.Optional(
    Type.String({
      description: "Markdown shown while this option is highlighted.",
    }),
  ),
});

const QuestionSchema = Type.Object({
  question: Type.String({ description: "The complete question, ending in a question mark." }),
  header: Type.String({
    maxLength: HEADER_MAX,
    description: 'Short chip naming the question, e.g. "Storage".',
  }),
  options: Type.Array(OptionSchema, { minItems: MIN_OPTIONS, maxItems: MAX_OPTIONS }),
  multiSelect: Type.Optional(
    Type.Boolean({ description: "Let the user pick several options instead of one." }),
  ),
});

/** One answer per line, with its note beneath, as every message about answers reads. */
export function answerLines(answers: readonly QuestionAnswer[]): string[] {
  const lines: string[] = [];
  for (const answer of answers) {
    lines.push(`- ${answer.header}: ${answer.values.join(", ")}`);
    if (answer.note) lines.push(`  note: ${answer.note}`);
  }
  return lines;
}

/** What the model sees: the answers as a list it can act on, or the refusal. */
export function formatResult(result: QuestionsResult): string {
  if (result.interrupted) {
    return "The questions were interrupted, not answered or declined. Do not treat this as a decision.";
  }
  if (result.cancelled) {
    return "The user cancelled the questions without answering. Do not treat this as a decision.";
  }
  return ["The user answered:", ...answerLines(result.answers)].join("\n");
}

/**
 * The questionnaire a call asked for; elsewhere a sequential walk of the host's
 * own dialogs. `previous` pre-selects its answers in the terminal dialog only,
 * which is where re-answering happens.
 */
export async function askQuestions(
  ctx: ExtensionContext,
  questions: readonly Question[],
  signal: AbortSignal | undefined,
  previous?: readonly QuestionAnswer[],
  lifecycle?: QuestionLifecycle,
): Promise<QuestionsResult> {
  if (ctx.mode !== "tui") return askSequentially(ctx, questions);
  const interrupted: QuestionsResult = { answers: [], cancelled: true, interrupted: true };
  if (signal?.aborted) return interrupted;

  // Persistence can fail (or the extension can already be invalidated during teardown).
  // It must never prevent done() from releasing the host's attention state.
  const persist = (action: () => void) => {
    try {
      action();
    } catch {
      try {
        ctx.ui.notify("Could not save the question draft to this session.", "warning");
      } catch {
        // A shutting-down host may no longer accept notifications either.
      }
    }
  };
  let cleanup = () => {};
  try {
    return await ctx.ui.custom<QuestionsResult>(
      (tui, theme, _keys, done) => {
        let closed = false;
        const dialog = new QuestionsDialog(
          tui,
          theme,
          questions,
          (result) => {
            if (closed) return;
            closed = true;
            persist(() => lifecycle?.complete());
            cleanup();
            done(result);
          },
          previous,
          lifecycle?.saved,
        );
        const suspend = () => {
          if (closed) return;
          closed = true;
          persist(() => lifecycle?.suspend(dialog.snapshot()));
        };
        const abort = () => {
          if (closed) return;
          suspend();
          cleanup();
          // Let the host unmount the dialog and clear its blocked state.
          done(interrupted);
        };
        cleanup = () => {
          signal?.removeEventListener("abort", abort);
          lifecycle?.interrupt(undefined);
        };
        lifecycle?.interrupt(abort);
        signal?.addEventListener("abort", abort, { once: true });
        // The factory can run after the initial check, as the turn is interrupted.
        if (signal?.aborted) queueMicrotask(abort);
        return Object.assign(dialog, {
          dispose() {
            suspend();
            cleanup();
          },
        });
      },
      {
        overlay: false,
        blocked: { kind: "question", message: questions[0]?.question ?? "Answer questions" },
      },
    );
  } finally {
    cleanup();
  }
}

/**
 * RPC, JSON and print hosts get the same answers through their own prompt
 * primitives. A multi-select question is asked repeatedly until the user says
 * Done, which is the only shape those dialogs offer.
 */
async function askSequentially(
  ctx: ExtensionContext,
  questions: readonly Question[],
): Promise<QuestionsResult> {
  const answers: QuestionAnswer[] = [];
  for (const question of questions) {
    const values = question.multiSelect
      ? await askMultiSelect(ctx, question)
      : await askSingle(ctx, question);
    if (values === undefined) return { answers: [], cancelled: true };
    if (values.length > 0) {
      answers.push({ header: question.header, question: question.question, values });
    }
  }
  return { answers, cancelled: false };
}

const prompt = (question: Question) => `${question.header}: ${question.question}`;

async function askSingle(ctx: ExtensionContext, question: Question): Promise<string[] | undefined> {
  const choice = await ctx.ui.select(prompt(question), [
    ...question.options.map((option) => option.label),
    TYPE_SOMETHING,
  ]);
  if (choice === undefined) return undefined;
  if (choice !== TYPE_SOMETHING) return [choice];
  const text = await ctx.ui.input(prompt(question), "Your answer");
  return text?.trim() ? [text.trim()] : [];
}

async function askMultiSelect(
  ctx: ExtensionContext,
  question: Question,
): Promise<string[] | undefined> {
  const picked = new Set<string>();
  for (;;) {
    const entries = question.options.map((option) =>
      picked.has(option.label) ? `✓ ${option.label}` : option.label,
    );
    if (picked.size > 0) entries.push("Done");
    entries.push(TYPE_SOMETHING);
    const choice = await ctx.ui.select(prompt(question), entries);
    if (choice === undefined) return undefined;
    if (choice === "Done") return [...picked];
    if (choice === TYPE_SOMETHING) {
      const text = await ctx.ui.input(prompt(question), "Your answer");
      if (text?.trim()) picked.add(text.trim());
      continue;
    }
    if (picked.has(choice)) picked.delete(choice);
    else picked.add(choice);
  }
}

export default function (pi: ExtensionAPI) {
  let pending: PendingDraft | null = null;
  let interrupt: (() => void) | undefined;
  const restore = (ctx: ExtensionContext) => {
    pending = null;
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type !== "custom" || entry.customType !== DRAFT_ENTRY) continue;
      const data = entry.data as Partial<PendingDraft> | null;
      if (data === null) pending = null;
      else if (typeof data?.key === "string" && isQuestionsDraft(data.draft))
        pending = { key: data.key, draft: data.draft };
    }
  };
  pi.on("session_start", (_event, ctx) => restore(ctx));
  pi.on("session_tree", (_event, ctx) => restore(ctx));
  pi.on("session_shutdown", () => interrupt?.());

  pi.registerTool({
    name: TOOL_NAME,
    label: "Ask",
    description: DESCRIPTION,
    promptSnippet: "Ask the user multiple-choice questions.",
    parameters: Type.Object({
      questions: Type.Array(QuestionSchema, { minItems: 1, maxItems: MAX_QUESTIONS }),
    }),
    // One dialog at a time: two would fight over the editor slot.
    executionMode: "sequential",
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const invalid = validateQuestions(params.questions);
      if (invalid) throw new Error(`ask_user_question: ${invalid}`);
      // Property order in model-authored JSON is not part of a questionnaire's identity.
      const key = JSON.stringify(
        params.questions.map(({ header, question, options, multiSelect }) => ({
          header,
          question,
          multiSelect: multiSelect ?? false,
          options: options.map(({ label, description, preview }) => ({
            label,
            description,
            preview,
          })),
        })),
      );
      const result = await askQuestions(ctx, params.questions, signal, undefined, {
        saved: pending?.key === key ? pending.draft : undefined,
        suspend(draft) {
          pending = { key, draft };
          pi.appendEntry(DRAFT_ENTRY, pending);
        },
        complete() {
          if (pending && pending.key !== key) return;
          pending = null;
          pi.appendEntry(DRAFT_ENTRY, null);
        },
        interrupt(close) {
          interrupt = close;
        },
      });
      return {
        content: [{ type: "text" as const, text: formatResult(result) }],
        details: result,
      };
    },
  });
}
