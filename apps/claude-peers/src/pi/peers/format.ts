/** The three shorthands this package needs; the registry and the peer list are its only readers. */

/** `text` on one line, whitespace collapsed. */
export const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

/** `text` cut to `max` characters, the last one an ellipsis. */
export const clip = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

/** A coarse age: minutes, hours up to two days, then days; `fresh` under a minute. */
export const formatAge = (ms: number, fresh: string) => {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return fresh;
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return hours < 48 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
};
