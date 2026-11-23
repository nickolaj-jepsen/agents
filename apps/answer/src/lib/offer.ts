/**
 * The words beside the offer's title: how many answers are in, then the key that opens the
 * form. The separator belongs to the note, so the title and the note never run together.
 */
export const offerNote = (answered: number, shortcut: string) =>
  `${answered ? ` · ${answered} answered` : ""} · ${shortcut} or /answer`;
