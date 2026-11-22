/**
 * The digits a terminal card takes: a row answers by its place on screen, as its letter does.
 */

/**
 * The digits that answer a row by its place on screen, so a keyboard-driven client can take a
 * number the reply never prints. The first nine rows take one each; the tenth on takes none.
 */
export const POSITIONS = "123456789";

/** The place a key names, counting the rows drawn top down; -1 for anything but a digit. */
export const rowOf = (key: string) => (key.length === 1 ? POSITIONS.indexOf(key) : -1);
