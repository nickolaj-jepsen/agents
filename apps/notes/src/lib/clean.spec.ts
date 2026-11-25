import { describe, expect, it } from "vitest";
import { clean, REPLACEMENT } from "./clean.ts";

describe("clean", () => {
  it("leaves text, tabs and newlines as they are", () => {
    const text = "# Plan\n\n\tindented æøå 🎉\n";
    expect(clean(text)).toBe(text);
  });

  it("turns CRLF and a lone CR into a newline", () => {
    expect(clean("a\r\nb\rc\n\rd")).toBe("a\nb\nc\n\nd");
  });

  it("replaces escape sequences, so none reaches a terminal", () => {
    const evil = "x\u001b]52;c;ZWNobw==\u0007y\u001b[2Jz";
    const out = clean(evil);
    expect(out).not.toMatch(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/);
    expect(out).toBe(`x${REPLACEMENT}]52;c;ZWNobw==${REPLACEMENT}y${REPLACEMENT}[2Jz`);
  });

  it("replaces every C0 control but tab and newline, DEL and C1", () => {
    for (let code = 0; code < 0xa0; code++) {
      const char = String.fromCharCode(code);
      const keeps = char === "\t" || char === "\n" || (code >= 0x20 && code < 0x7f);
      if (code === 0x0d) expect(clean(char)).toBe("\n");
      else expect(clean(char)).toBe(keeps ? char : REPLACEMENT);
    }
  });

  it("replaces a form feed", () => {
    expect(clean("a\fb")).toBe(`a${REPLACEMENT}b`);
  });
});
