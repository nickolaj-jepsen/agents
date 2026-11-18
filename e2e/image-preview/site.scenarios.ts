import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { crc32, deflateSync } from "node:zlib";
import type { Turn } from "../lib/harness.ts";
import { site, slow, type SiteScenario } from "../lib/site.ts";

type Rgb = [number, number, number];

/** The fixture picture: 8-bit RGB, no interlace, written byte by byte so no binary sits in the repo. */
function png(width: number, height: number, pixel: (x: number, y: number) => Rgb): Buffer {
  const stride = width * 3;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixel(x, y);
      const at = y * (stride + 1) + 1 + x * 3;
      raw[at] = r;
      raw[at + 1] = g;
      raw[at + 2] = b;
    }
  const chunk = (type: string, body: Buffer) => {
    const out = Buffer.alloc(12 + body.length);
    out.writeUInt32BE(body.length, 0);
    out.write(type, 4, "latin1");
    body.copy(out, 8);
    out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length);
    return out;
  };
  const head = Buffer.alloc(13);
  head.writeUInt32BE(width, 0);
  head.writeUInt32BE(height, 4);
  head[8] = 8;
  head[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", head),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** A bar chart of weekly signups, in the site's own palette: a picture with a shape to read. */
const signups = () => {
  const width = 640;
  const height = 360;
  const [left, right, top, bottom] = [56, 24, 40, 44];
  const values = [42, 55, 49, 63, 71, 68, 84, 96];
  const floor = 24;
  const ceiling = 100;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const bar = chartWidth / values.length;
  const yOf = (value: number) =>
    top + chartHeight - Math.round(((value - floor) / (ceiling - floor)) * chartHeight);
  const bars = ["#3AA99F", "#4385BE", "#CE5D97", "#D0A215"];
  return png(width, height, (x, y) => {
    const grid =
      y >= top && y <= top + chartHeight && (top + chartHeight - y) % (chartHeight / 4) < 1;
    const axis = x === left - 1 && y >= top && y <= top + chartHeight + 1;
    const base = y === top + chartHeight + 1 && x >= left && x <= width - right;
    if (axis || base) return [135, 133, 128];
    if (grid) return [226, 222, 209];
    const i = Math.floor((x - left) / bar);
    if (x >= left && x < width - right && i >= 0 && i < values.length) {
      const inner = bar * 0.62;
      const start = left + i * bar + (bar - inner) / 2;
      const column = yOf(values[i]!);
      if (x >= start && x < start + inner && y >= column && y <= top + chartHeight) {
        const shade = bars[i % bars.length]!;
        const edge = y - column < 3 || x - start < 1;
        const [r, g, b] = [1, 3, 5].map((at) => parseInt(shade.slice(at, at + 2), 16)) as Rgb;
        return edge ? [r, g, b] : [r - 28, g - 28, b - 24];
      }
    }
    // A little texture, so the picture does not read as a flat block of colour.
    const noise = ((x * 7 + y * 13) % 5) - 2;
    return [247 + noise, 245 + noise, 238 + noise];
  });
};

const CHART = "reports/signups.png";
const setup: SiteScenario["setup"] = (ctx) => {
  const path = join(ctx.cwd, CHART);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, signups());
};

const turns: Turn[] = [
  {
    text: "I'll look at the report the export script wrote.",
    toolCall: { name: "Read", arguments: { file_path: CHART } },
  },
  {
    text: "Signups climbed from 42 to 96 over the eight weeks, with the steepest run over the last two: the referral banner went live in week seven.",
  },
];

const ASK = "What do the signups look like?";

export default site({
  plugin: "image-preview",
  demo: [
    {
      caption:
        "A Read of a PNG draws the picture under the tool row, fitted to the terminal, with the file's path below it.",
      capture: "kitty",
      project: "growth-report",
      setup,
      start: {
        hermetic: true,
        plugins: ["image-preview"],
        turns,
        args: ["--allowedTools", "Read"],
        env: { CLAUDE_CODE_FORCE_TERMINAL_IMAGES: "1" },
      },
      steps: [
        { sleep: 500 },
        slow(ASK),
        { press: "Enter" },
        { wait: /Read 1 file/, timeout: 20_000 },
        { sleep: 3000 },
        { wait: "steepest run", timeout: 20_000 },
        { sleep: 4000 },
      ],
    },
  ],
  stills: {
    read: {
      caption:
        "The preview keeps the picture's aspect ratio, takes at most 40 columns and 15 rows, and links its path.",
      capture: "kitty",
      project: "growth-report",
      setup,
      start: {
        hermetic: true,
        plugins: ["image-preview"],
        turns,
        args: ["--allowedTools", "Read"],
        env: { CLAUDE_CODE_FORCE_TERMINAL_IMAGES: "1" },
      },
      steps: [{ type: ASK }, { press: "Enter" }, { wait: "steepest run", timeout: 20_000 }],
    },
  },
});
