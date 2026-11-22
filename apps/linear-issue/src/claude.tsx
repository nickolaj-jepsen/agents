import { atom, read, update } from "claude-code";
import type { ElementTable, EngineInterface, Register, RenderElement } from "claude-code";

import { drafter, PRIORITIES, type Form as CoreForm, type TeamCache } from "./lib/draft.ts";
import {
  act,
  isControl,
  startView,
  type Drawn,
  type Effect,
  type Intent,
  type View as CoreView,
} from "./lib/screen.ts";
import type { Editing, Form, Last, View } from "./claude/types.d.ts";
import { guiBand, guiPane } from "./claude/gui";
import { RING, ringMove } from "@agents/kit-core/paint/claude.tsx";
import { hasLinear, hostFor, openUrl } from "./claude/linear.ts";
import { fieldKey, terminalBand, terminalPane, typingOf } from "./claude/terminal.tsx";
import { forSurface, kitOf, paneOptions } from "@agents/kit-legacy/claude/ui.tsx";
import {
  ANCHOR,
  cardText,
  hasButtons,
  hotkeysIn,
  insertButton,
  isButton,
  isElement,
  LEARN_MORE,
  pathTo,
} from "./claude/ysk.tsx";

// The mod's state is declared in `types.d.ts`, which cannot import: these fail to compile when
// its shapes and the shared core's drift apart.
const _form: Form = {} as CoreForm;
const _core: CoreForm = {} as Form;
const _view: View = {} as CoreView;
void [_form, _core, _view];

const YSK = "cc-plugin-you-should-know";
const PANE = "linear-draft";
// Digits the button may take, first free wins; 8 and 9 belong to the draft chip.
const HOTKEYS = ["3", "4", "5", "6", "7"];
const DISCARD_ARM_MS = 5000;

// The card the button was pressed on, drawn as nothing until another replaces it.
const hidden = atom({ plugin: "linear-issue", key: "hidden" } as const, null);
const form = atom({ plugin: "linear-issue", key: "form" } as const, null);
const view = atom({ plugin: "linear-issue", key: "view" } as const, startView());
const keys = atom({ plugin: "linear-issue", key: "keys" } as const, false);
const filed = atom({ plugin: "linear-issue", key: "filed" } as const, []);
const isPaneOpen = atom({ plugin: "linear-issue", key: "isPaneOpen" } as const, false);
const isDiscardArmed = atom({ plugin: "linear-issue", key: "isDiscardArmed" } as const, false);
// Whether the possible duplicate is opened in place (graphical surfaces).
const isDuplicateOpen = atom({ plugin: "linear-issue", key: "isDuplicateOpen" } as const, false);
// The fields opened to edit, and the label search (graphical surfaces).
const CLOSED_EDITING: Editing = { isOpen: false, query: "", queryRevision: 0, shown: [] };
const editing = atom({ plugin: "linear-issue", key: "editing" } as const, CLOSED_EDITING);

// Set by a Learn more press, cleared once the expanded card has been checked.
let isExpanding = false;
// Per team key; fetched once a session.
const teams: TeamCache = new Map();
// A draft on its way to Linear: a second press while it is does nothing.
let isSending = false;
// The terminal's screen as it was last drawn: what an arrow steps is decided against it.
let lastDrawn: Drawn | undefined;
// The description as its field holds it while it is typed in. Escape takes the ring off the
// field without a word to the mod, and the Enter after it lands on the screen: it saves this.
let typedBody: string | undefined;
// Whether the engine's ring is on the description's field, as far as its moves say.
let isRingInBody = false;

/** One toast per Claude Code version, when the expanded card no longer has the anchor. */
async function warnDrift($: EngineInterface) {
  const { version } = await $.session.version();
  if ((await $.store.get("warnedVersion").catch(() => undefined)) === version) return;
  await $.store.set("warnedVersion", version);
  $.ui.toast(
    `linear-issue: the You should know card no longer has "${ANCHOR}", so its Linear button is hidden; update apps/linear-issue`,
  );
}

/** What the shared drafting asks of a client, with the draft this file keeps. */
function host($: EngineInterface) {
  return hostFor($, {
    read: () => read($, form),
    update: async (change) => {
      await update($, form, change);
    },
  });
}

/** Merges `patch` into the open form; nothing when no draft is open. */
const patchForm = ($: EngineInterface, patch: Partial<Form>) =>
  update($, form, (cur) => cur && { ...cur, ...patch });

async function hold($: EngineInterface, held: boolean) {
  if ((await read($, keys)) !== held) await update($, keys, () => held);
}

async function openPane($: EngineInterface) {
  const opened = await $.ui.open(
    paneOptions({
      id: PANE,
      title: "Linear draft",
      focus: true,
      closeOnEscape: true,
      rows: 30,
    }),
  );
  await update($, isPaneOpen, () => true);
  await hold($, opened.isPlaced);
  if (!opened.isPlaced) $.ui.toast(`The Linear draft pane can't show yet: ${opened.reason}`);
}

/** Closes the pane and leaves the draft for the chip. A mod's own close skips its `ui.close` hook. */
async function hidePane($: EngineInterface) {
  await update($, isPaneOpen, () => false);
  await hold($, false);
  await $.ui.close({ id: PANE });
}

/**
 * Opens the draft pane for `seed` and starts drafting into it; one draft at a time.
 * Call it from the press or command hook itself: a pane opened after that hook returned
 * counts as unasked and stays hidden below 144 columns.
 */
async function start($: EngineInterface, kind: "insight" | "note", seed: string) {
  const started = await drafter(host($), teams).start({ kind, text: seed });
  if (started) {
    const last = (await $.store.get("last").catch(() => undefined)) as Last | undefined;
    await update($, view, () => startView(last?.open));
  }
  await openPane($);
  if (!started) $.ui.toast("Reopened your Linear draft; Discard it to start another");
}

async function discard($: EngineInterface) {
  await update($, isDiscardArmed, () => false);
  await update($, isDuplicateOpen, () => false);
  await update($, editing, () => CLOSED_EDITING);
  await update($, view, (v) => startView(v.opens));
  await update($, form, () => null);
  await hidePane($);
}

/**
 * Writes the draft to Linear (the issue, or the duplicate's comment) and echoes the result
 * above the prompt; `open` then opens it in the browser.
 */
async function file($: EngineInterface, { asComment = false, open = false }) {
  // Two presses in a row both find the draft ready before either marks it as sent.
  if (isSending) return;
  isSending = true;
  const echo = await drafter(host($), teams)
    .submit({ asComment, open })
    .finally(() => {
      isSending = false;
    });
  // Not filed: the draft says why, on the page it stays on.
  if (!echo) return;
  await update($, filed, (list) => [...list.filter((x) => x.key !== echo.key), echo]);
  await discard($);
  if (open && echo.url) await openUrl($, echo.url);
}

/** What a key or a click on the terminal's screen asked for, beyond the view's own change. */
async function runEffect($: EngineInterface, effect: Effect) {
  switch (effect.do) {
    case "hide":
      return hidePane($);
    case "discard":
      return discard($);
    case "retry":
      return drafter(host($), teams).retry();
    case "team":
      return drafter(host($), teams).switchTeam(effect.team);
    case "set":
      return patchForm($, effect.patch);
    case "create":
      return file($, { open: effect.open });
    case "comment":
      return file($, { asComment: true, open: effect.open });
  }
}

/** A key or a click on the terminal's screen. */
async function send($: EngineInterface, given: Intent, drawn = lastDrawn) {
  const v = await read($, view);
  const f = await read($, form);
  const intent: Intent =
    v.step === "body" && "enter" in given && typedBody !== undefined ? { text: typedBody } : given;
  const acted = act(f, v, intent, drawn, await $.clock.now());
  if (acted.view !== v) await update($, view, () => acted.view);
  for (const effect of acted.effects) await runEffect($, effect);
  // The engine keeps its ring by place, so it is put on a text field when that is drawn, and
  // back on the parked button when it goes. Denied when the pane lost the keyboard.
  const typing = typingOf(acted.view);
  if (typing !== typingOf(v)) {
    typedBody = undefined;
    isRingInBody = typing === "body";
    await $.ui
      .focus({ requestId: PANE, key: typing ? fieldKey(f, typing) : RING.park })
      .catch(() => undefined);
  }
}

export const register: Register = (on) => {
  on("session.start", async ($, e, next) => {
    await $.command
      .register({
        name: "linear",
        description:
          "Draft a Linear issue from the text after it (or the recent conversation) for approval",
        argumentHint: "[what to file]",
        // Filing a thought shouldn't wait for the running turn; nothing here touches it.
        immediate: true,
      })
      .catch((error) =>
        $.ui.log(`linear-issue: /linear not registered: ${String(error)}`, { to: "debug" }),
      );
    return next(e);
  });

  on("command.run", { command: "linear" }, async ($, e) => {
    if (!(await hasLinear($)))
      return { text: "No Linear MCP server is configured in this session." };
    await start($, "note", e.args.trim());
    return { text: "Drafting a Linear issue in the draft pane." };
  });

  // Closing only hides the pane: the draft stays for the chip or /linear to reopen.
  on("ui.close", { id: PANE }, async ($, e, next) => {
    await update($, isPaneOpen, () => false);
    await hold($, false);
    // Escape is also the answer to Discard's question, and the way out of a text field, which
    // has no key of its own for it: the draft comes back as it stood.
    await update($, view, (v) =>
      v.isConfirming || typingOf(v) ? { ...v, isConfirming: false, step: "review" as const } : v,
    );
    typedBody = undefined;
    return next(e);
  });

  // The screen draws its own keys, so the engine's ring (which inverts what it rests on) is
  // kept on a button that draws nothing. An arrow tries to move it to the stop before or after:
  // that becomes a step on the screen instead, and the ring goes back.
  on("ui.focus", { requestId: PANE }, async ($, e, next) => {
    const move = ringMove(e.element, isControl);
    const typing = typingOf(await read($, view));
    const field = typing === "body" ? fieldKey(await read($, form), "body") : undefined;
    // Where the ring goes while the description is typed. Its field moves between its own rows
    // on an arrow and hands the ring on from its first and last: to the buttons under it, or
    // to what is over it, where Escape sends the ring too, with nothing to tell the two apart.
    // Neither may lose what was typed, so from the last row the ring goes back in, and from the
    // first it is parked with the field as it stands: Enter then saves it, an arrow goes back
    // in, and Escape closes the pane, as it does from any parked ring.
    const target = (): string | undefined => {
      if (!field || !move) return move ? RING.park : undefined;
      const isBelow = "hit" in move && move.hit.startsWith("act:");
      const goesIn = isRingInBody ? isBelow : "by" in move && move.by !== 0;
      return goesIn ? field : RING.park;
    };
    const element = target();
    if (field) isRingInBody = (element ?? e.element) === field;
    // An arrow while the title is typed means the ring had left the field: back to the draft.
    if (move && "by" in move && move.by && !field)
      await send($, typing ? { escape: true } : { move: move.by });
    const moved = await next(element ? { ...e, element } : e);
    // A ring that moved in the pane says the pane has the keyboard.
    if (!moved.deny) await hold($, true);
    return moved;
  });

  // What the person types in the prompt went to the prompt, and a letter the pane does not
  // bind takes the keyboard there with it.
  on("prompt.edit", async ($, e, next) => {
    await hold($, false);
    return next(e);
  });
  on("prompt.change", async ($, e, next) => {
    if (e.origin.kind !== "plugin") await hold($, false);
    return next(e);
  });

  on("ui.press", { plugin: YSK }, async (_$, e, next) => {
    if (e.element === LEARN_MORE) isExpanding = true;
    return next(e);
  });

  on("ui.render", { component: "Pane", requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e);
    const k = kitOf(els, e);
    const f = await read($, form);
    const isOpen = await read($, isDuplicateOpen);
    const edit = await read($, editing);
    const set = (patch: Partial<Form>) => patchForm($, patch);
    const setEditing = (patch: (cur: Editing) => Partial<Editing>) =>
      update($, editing, (cur) => ({ ...cur, ...patch(cur) }));
    const gui = (isReadOnly: boolean) =>
      guiPane(k, {
        form: f,
        isDuplicateOpen: isOpen,
        editing: edit,
        priorities: PRIORITIES,
        isReadOnly,
        Input: els.Input,
        Select: els.Select,
        on: {
          create: () => file($, { open: false }),
          createOpen: () => file($, { open: true }),
          comment: () => file($, { asComment: true, open: false }),
          discard: () => discard($),
          toggleDuplicate: () => update($, isDuplicateOpen, (open) => !open),
          set,
          switchTeam: (team) => drafter(host($), teams).switchTeam(team),
          // Opening shows the chosen labels as on-or-off, so one turned off can be turned back on.
          toggleEditing: () =>
            setEditing((cur) =>
              cur.isOpen
                ? { isOpen: false, query: "", queryRevision: cur.queryRevision + 1 }
                : { isOpen: true, shown: f?.labelIds ?? [] },
            ),
          search: (query) => setEditing(() => ({ query })),
          addLabel: async (id) => {
            await update(
              $,
              form,
              (cur) => cur && { ...cur, labelIds: [...cur.labelIds.filter((l) => l !== id), id] },
            );
            await setEditing((cur) => ({
              query: "",
              queryRevision: cur.queryRevision + 1,
              shown: [...cur.shown.filter((l) => l !== id), id],
            }));
          },
          toggleLabel: (id) =>
            update(
              $,
              form,
              (cur) =>
                cur && {
                  ...cur,
                  labelIds: cur.labelIds.includes(id)
                    ? cur.labelIds.filter((l) => l !== id)
                    : [...cur.labelIds, id],
                },
            ),
        },
      });
    const v = await read($, view);
    const held = await read($, keys);
    // The terminal's screen is the shared one, painted from the kit's lines; a graphical
    // surface's, with native controls, is `gui.tsx`. The mobile app draws no Input or Select,
    // so it shows the draft as written.
    return forSurface(k, {
      tui: () => {
        const pane = terminalPane(els as ElementTable<"terminal">, {
          form: f,
          view: v,
          held,
          width: e.props.bodyColumns,
          rows: e.props.scroll.bodyRows,
          send: (intent, drawn) => send($, intent, drawn),
          typed: (text) => {
            typedBody = text;
          },
        });
        lastDrawn = pane.drawn;
        return pane.tree;
      },
      gui: () => gui(false),
      mobile: () => gui(true),
    });
  });

  // The band asks each plugin for its own row: this one holds the draft chip and the filed
  // issues, and passes while it has neither.
  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e);
    const els = $.ui.resolve(e);
    const k = kitOf(els, e);

    const issues = await read($, filed);
    const draft = (await read($, isPaneOpen)) ? null : await read($, form);
    const isArmed = await read($, isDiscardArmed);
    if (issues.length === 0 && !draft) return next(e);
    const handlers = {
      onOpen: () => openPane($),
      onOpenUrl: (url: string) => openUrl($, url),
      onCopy: async (url: string) => {
        const r = await $.ui.copy({ text: url });
        $.ui.toast(r.isCopied ? `Copied ${url}` : `Couldn't copy: ${r.reason}`);
      },
      onDismiss: (key: string) => update($, filed, (list) => list.filter((x) => x.key !== key)),
    };
    // No digits on a graphical surface: its buttons are pressed by a click.
    return forSurface(k, {
      tui: () =>
        terminalBand(els as ElementTable<"terminal">, {
          draft,
          issues,
          isArmed,
          width: e.props.bodyColumns,
          on: {
            open: handlers.onOpen,
            // A digit in an empty prompt presses this, so a prompt starting "9" must not discard.
            discard: async () => {
              if (await read($, isDiscardArmed)) return discard($);
              await update($, isDiscardArmed, () => true);
              $.clock.after(DISCARD_ARM_MS, () => void update($, isDiscardArmed, () => false));
            },
            openUrl: handlers.onOpenUrl,
            copy: handlers.onCopy,
            dismiss: handlers.onDismiss,
          },
        }),
      gui: () => guiBand(k, { draft, issues, onDiscard: () => discard($), ...handlers }),
    });
  });

  // The built-in card's own row, which this hook names to splice the button into.
  on("ui.render", { component: "AbovePrompt", plugin: YSK }, async ($, e, next) => {
    const tree = await next(e);
    if (e.props.hasSurvey) return tree;
    const els = $.ui.resolve(e);
    const { Box, Button } = els;
    const k = kitOf(els, e);

    const card = cardText(tree);
    if (card !== "" && card === (await read($, hidden))) return <Box />;

    const anchor = pathTo(tree, (n) => isButton(n, ANCHOR))?.at(-1);
    if (!anchor) {
      // Past the "One moment…" spinner (no buttons), a card without the anchor means it changed.
      if (
        isExpanding &&
        hasButtons(tree) &&
        pathTo(tree, (n) => isButton(n, LEARN_MORE)) === undefined
      ) {
        isExpanding = false;
        await warnDrift($);
      }
      return tree;
    }
    isExpanding = false;
    if (!(await hasLinear($))) return tree;

    const style = isElement(anchor) && anchor.type === "Button" ? anchor.props : undefined;
    const taken = hotkeysIn(tree);
    const button = (
      <Button
        key="linear-issue"
        label="Linear issue"
        // The digit is the terminal's way in: a graphical surface would draw it as a chip.
        hotkey={forSurface(k, {
          tui: () => HOTKEYS.find((h) => !taken.has(h)),
          gui: () => undefined,
        })}
        plain={style?.plain}
        dimColor={style?.dimColor}
        onPress={async () => {
          await update($, hidden, () => card);
          await start($, "insight", card);
        }}
      />
    );
    return (insertButton(tree, button) ?? tree) as RenderElement;
  });
};
