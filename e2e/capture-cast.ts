import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

function readCast(path: string) {
  const [first, ...lines] = readFileSync(path, "utf8").trimEnd().split("\n");
  const { version, width, height } = JSON.parse(first ?? "");
  if (
    version !== 2 ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1
  )
    throw new Error("expected an asciicast v2 header with a positive width and height");
  const output: [number, string][] = [];
  let previous = 0;
  for (const line of lines) {
    const [time, kind, data] = JSON.parse(line);
    if (kind === "r") throw new Error("cast resizes are not supported");
    if (kind !== "o") continue;
    if (!Number.isFinite(time) || time < previous || typeof data !== "string")
      throw new Error("invalid cast output event");
    previous = time;
    // Coalesce writes within one video frame so split graphics commands arrive together.
    const frame = output.at(-1);
    if (frame && time - frame[0] < 1 / 30) frame[1] += data;
    else output.push([time, data]);
  }
  if (!output.length) throw new Error("cast has no output events");
  return { width, height, output };
}

// Kitty can leave virtual images blank when an upload and a transcript redraw share a frame.
// Re-send complete, cursor-independent uploads after the placeholder cells have been drawn.
function virtualUploads(frame: string) {
  const complete: string[] = [];
  let pending = "";
  for (const [command, control] of frame.matchAll(/\x1b_G([^;\x1b]*);[^\x1b]*\x1b\\/g)) {
    const fields = control!.split(",");
    if (
      fields.includes("a=T") &&
      fields.includes("U=1") &&
      fields.some((f) => /^i=[1-9]\d*$/.test(f))
    )
      pending = command;
    else if (pending && fields.every((f) => /^[mq]=[012]$/.test(f))) pending += command;
    else pending = "";
    if (pending && !fields.includes("m=1")) {
      complete.push(pending);
      pending = "";
    }
  }
  return complete.join("");
}

function kittyTheme() {
  const config = readFileSync(new URL("./tui-test.toml", import.meta.url), "utf8");
  const colors = config.split("[profiles.default.colors]")[1]?.split("[")[0] ?? "";
  const palette = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white"];
  const names = [...palette, ...palette.map((name) => `bright_${name}`)];
  return Array.from(colors.matchAll(/^(\w+) = "(#[\da-fA-F]{6})"$/gm), ([, key, color]) => {
    const index = names.indexOf(key!);
    return `${index < 0 ? key : `color${index}`}=${color}`;
  });
}

async function play(cast: string, scratch: string) {
  const { width, height, output } = readCast(cast);
  if (process.stdout.columns !== width || process.stdout.rows !== height)
    throw new Error(`Kitty did not open at the cast's ${width}×${height} cell size`);
  const { DISPLAY, WINDOWID } = process.env;
  if (!DISPLAY || !WINDOWID) throw new Error("capture requires Kitty on a private X11 display");

  const grab = [
    "-f",
    "x11grab",
    "-window_id",
    WINDOWID,
    "-draw_mouse",
    "0",
    "-framerate",
    "30",
    "-i",
    DISPLAY,
  ];
  const ff = ["-hide_banner", "-loglevel", "error"];
  const pad = ["-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2:color=0x1C1B1A"]; // H.264 needs even dimensions.
  const ffmpeg = process.env.CAST_FFMPEG || "ffmpeg";
  const recorder = spawn(ffmpeg, [
    ...ff,
    "-progress",
    "pipe:1",
    "-stats_period",
    "0.1",
    ...grab,
    ...pad,
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    join(scratch, "capture.mp4"),
  ]);
  let stderr = "";
  recorder.stderr.setEncoding("utf8").on("data", (chunk: string) => {
    stderr += chunk;
  });
  const recorded = once(recorder, "close").then(([code, signal]) => {
    if (code !== 0) throw new Error(stderr.trim() || `FFmpeg exited with ${signal ?? code}`);
  });
  recorder.stdin.on("error", () => {}); // If FFmpeg exits early, `recorded` carries the error.
  process.stdin.setRawMode(true).resume();
  try {
    await Promise.race([
      once(recorder.stdout, "data"),
      recorded.then(() => {
        throw new Error("FFmpeg stopped before recording began");
      }),
      delay(10_000, undefined, { ref: false }).then(() => {
        throw new Error("FFmpeg did not start recording");
      }),
    ]);
    recorder.stdout.resume();
    const start = performance.now();
    const write = (data: string) =>
      new Promise<void>((done, fail) =>
        process.stdout.write(data, (err) => (err ? fail(err) : done())),
      );
    const replay = async () => {
      for (const [time, data] of output) {
        const wait = start + time * 1000 - performance.now();
        if (wait > 0) await delay(wait);
        await write(data);
        if (data.includes("\u{10eeee}")) {
          const uploads = virtualUploads(data);
          if (uploads) {
            await delay(50);
            await write(uploads);
          }
        }
      }
      await delay(1600); // Leave the final screen visible before taking the lossless still.
    };
    await Promise.race([
      replay(),
      recorded.then(() => {
        throw new Error("FFmpeg stopped during playback");
      }),
    ]);
    execFileSync(ffmpeg, [
      ...ff,
      ...grab,
      ...pad,
      "-frames:v",
      "1",
      "-threads",
      "1",
      join(scratch, "capture.png"),
    ]);
    recorder.stdin.end("q\n");
    await recorded;
    writeFileSync(join(scratch, "done"), "");
  } finally {
    if (recorder.exitCode === null) recorder.kill();
    process.stdin.pause().setRawMode(false);
  }
}

function capture(cast: string, prefix: string, requireGraphics: boolean) {
  const { width, height, output } = readCast(cast);
  if (requireGraphics && !output.some(([, data]) => data.includes("\x1b_G")))
    throw new Error(
      "cast has no Kitty graphics; check that the scenario reached the inline preview",
    );
  const scratch = mkdtempSync(join(dirname(prefix), ".cast-capture-"));
  try {
    const options = [
      "linux_display_server=x11",
      "remember_window_size=no",
      `initial_window_width=${width}c`,
      `initial_window_height=${height}c`,
      "font_family=DejaVu Sans Mono",
      "font_size=12",
      "window_padding_width=12",
      "cursor_blink_interval=0",
      "clipboard_control=no-append",
      ...kittyTheme(),
    ];
    // No host desktop, user config or GPU. Use an X11 display just for this Kitty window.
    const result = execFileSync(
      "xvfb-run",
      [
        "-a",
        "-e",
        join(scratch, "xvfb.log"),
        "-s",
        "-screen 0 2560x1600x24",
        "kitty",
        "--config",
        "NONE",
        ...options.flatMap((option) => ["-o", option]),
        "-e",
        process.execPath,
        fileURLToPath(import.meta.url),
        "--play",
        cast,
        scratch,
      ],
      {
        env: {
          ...process.env,
          LIBGL_ALWAYS_SOFTWARE: "1",
          ...(process.env.CAST_MESA && {
            LIBGL_DRIVERS_PATH: join(process.env.CAST_MESA, "dri"),
            LD_LIBRARY_PATH: [process.env.CAST_MESA, process.env.LD_LIBRARY_PATH]
              .filter(Boolean)
              .join(":"),
            __GLX_VENDOR_LIBRARY_NAME: "mesa",
          }),
        },
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    try {
      readFileSync(join(scratch, "done"));
    } catch {
      throw new Error(result.trim() || "Kitty closed before capture finished");
    }
    for (const ext of ["png", "mp4"]) {
      renameSync(join(scratch, `capture.${ext}`), `${prefix}.${ext}`);
      console.log(`${prefix}.${ext}`);
    }
  } catch (err) {
    // Kitty does not forward the exit status or stderr of programs in its terminal.
    let playbackError: string;
    try {
      playbackError = readFileSync(join(scratch, "error"), "utf8");
    } catch {
      const stderr = (err as { stderr?: string }).stderr?.trim();
      let xvfbLog = "";
      try {
        xvfbLog = readFileSync(join(scratch, "xvfb.log"), "utf8").trim();
      } catch {
        /* xvfb-run did not start */
      }
      const details = [stderr, xvfbLog].filter(Boolean).join("\n");
      throw details ? new Error(details) : err;
    }
    throw new Error(playbackError);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

const args = process.argv.slice(2);
try {
  if (args[0] === "--play" && args.length === 3) {
    try {
      await play(args[1]!, args[2]!);
    } catch (err) {
      writeFileSync(join(args[2]!, "error"), err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
  } else {
    const requireGraphics = args[0] === "--require-graphics";
    const [cast, prefix, ...extra] = args.slice(requireGraphics ? 1 : 0);
    if (!cast || !prefix || extra.length)
      throw new Error("usage: just capture-cast <trusted.cast> <output-prefix>");
    if (process.platform !== "linux") throw new Error("cast capture requires Linux");
    capture(resolve(cast), resolve(prefix), requireGraphics);
  }
} catch (err) {
  console.error(`capture-cast: ${err instanceof Error ? err.message : err}`);
  process.exitCode = 1;
}
