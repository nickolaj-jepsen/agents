/**
 * Exa's `notices` say how a search's results were produced and are written for the model, so they
 * lead the result; `warnings` are about the request and are for whoever maintains this code.
 * Codes are an open set, so only the message is used.
 */
export interface ExaRemark {
  code?: string;
  path?: string;
  message?: string;
}

const messages = (remarks: ExaRemark[] | undefined) =>
  (remarks ?? []).map((r) => r.message?.trim() || r.code).filter((m): m is string => Boolean(m));

/** One `Note:` line per notice, to put above the results. */
export const noticeLines = (notices: ExaRemark[] | undefined) =>
  messages(notices).map((m) => `Note: ${m}`);

/** The warnings' messages, for the tool's details and never the model. */
export const warningMessages = (warnings: ExaRemark[] | undefined) => messages(warnings);
