import type { On } from "claude-code";
import { expect, test } from "claude-code/testing";
import type { Engine } from "claude-code/testing";

const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAAAkCAYAAAA5DDySAAAAdklEQVR42u3ZsRGAIAwFUIZxAAtHsLO2ZyVXYyHcAAu5Q8wrfpm78JrkQtqOXFtZ1r2Z2esTAAAAAAAAEBjg7w98qgfQo4FyncMCAAAAAADeAPQYMyMBPrEJAgAAAAAAAJMC2AQBAHARAgAAQFwAP0MAAIQGuAEhKJcojry0RgAAAABJRU5ErkJggg==";
const READ = {
  type: "image",
  file: {
    type: "image/png",
    base64: PNG,
    originalSize: 176,
    dimensions: { originalWidth: 64, originalHeight: 36 },
  },
} as const;
const VIEWPORT = { columns: 120, rows: 45 } as const;

function world(on: On, png = PNG) {
  const reads: string[] = [];
  on("fs.read", (_, e) => {
    reads.push(e.path);
    return { value: { base64: png } };
  });
  on("ui.render", ($, e) => {
    const { Text } = $.ui.resolve(e);
    return <Text>{`host ${e.component}`}</Text>;
  });
  return { reads };
}

const readResult = (
  $: Engine,
  output: unknown = READ,
  surface: "terminal" | "desktop" = "terminal",
) =>
  $.ui.mount({
    plugin: "image-preview",
    component: "ToolResult",
    surface,
    viewport: VIEWPORT,
    props: { tool_use_id: "read-1", tool: "Read", output, isErrored: false },
  });

const sentResult = ($: Engine, output: unknown) =>
  $.ui.mount({
    plugin: "image-preview",
    component: "ToolResult",
    surface: "terminal",
    viewport: VIEWPORT,
    props: { tool_use_id: "send-1", tool: "SendUserFile", output, isErrored: false },
  });

const call = (id: string, output: unknown, isRunning = false) => ({
  tool_use_id: id,
  tool: "Read",
  // Rereading one path in a group must still produce two independently keyed previews.
  input: { file_path: "/tmp/repeated.png" },
  isRunning,
  isErrored: false,
  isInterrupted: false,
  output,
});

test("a Read PNG draws inline at its aspect ratio", async ($, on) => {
  world(on);
  const ui = await readResult($);
  const images = await ui.findAll({ type: "Image" });
  expect(images).toHaveLength(1);
  expect(images[0]?.props).toMatchObject({
    source: { png: PNG },
    columns: 40,
    rows: 11,
    alt: "[image] image.png",
  });
  expect(await ui.find({ type: "Text", text: /host ToolResult/ })).toBeUndefined();
  await ui.unmount();
});

test("unsupported results and native surfaces keep the host renderer", async ($, on) => {
  world(on);
  const text = await readResult($, { type: "text", file: { content: "plain" } });
  expect(await text.find({ type: "Text", text: "host ToolResult" })).toBeDefined();
  await text.unmount();

  const desktop = await readResult($, READ, "desktop");
  expect(await desktop.find({ type: "Text", text: "host ToolResult" })).toBeDefined();
  await desktop.unmount();
});

test("a folded group keeps its summary and appends every completed Read image", async ($, on) => {
  world(on);
  const ui = await $.ui.mount({
    plugin: "image-preview",
    component: "ToolGroup",
    surface: "terminal",
    viewport: VIEWPORT,
    props: {
      calls: [call("one", READ), call("two", READ), call("running", undefined, true)],
      isActive: false,
      isExpanded: false,
    },
  });
  expect(await ui.find({ type: "Text", text: "host ToolGroup" })).toBeDefined();
  expect(await ui.findAll({ type: "Image" })).toHaveLength(2);
  expect(await ui.findAll({ type: "Link" })).toHaveLength(2);
  await ui.unmount();
});

test("a sent PNG uses a file source, its metadata dimensions, caption and other paths", async ($, on) => {
  const w = world(on);
  const ui = await sentResult($, {
    caption: "The generated chart",
    attachments: [
      {
        path: "/tmp/chart.png",
        size: 123,
        isImage: true,
        media_type: "image/png",
        scaled: { original_width: 1200, original_height: 600 },
      },
      { path: "/tmp/data.csv", size: 20, isImage: false },
    ],
  });
  expect((await ui.find({ type: "Image" }))?.props).toMatchObject({
    source: { file: "/tmp/chart.png", format: "png", generation: 123 },
    columns: 80,
    rows: 20,
  });
  expect(await ui.find({ type: "Text", text: "The generated chart" })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "/tmp/data.csv" })).toBeDefined();
  expect(w.reads).toEqual([]);
  await ui.unmount();
});

test("missing attachment dimensions are read once and cached across redraws", async ($, on) => {
  const w = world(on);
  const props = {
    tool_use_id: "send-1",
    tool: "SendUserFile" as const,
    output: {
      attachments: [{ path: "/tmp/chart.png", size: 176, isImage: true, media_type: "image/png" }],
    },
    isErrored: false,
  };
  const ui = await $.ui.mount({
    plugin: "image-preview",
    component: "ToolResult",
    surface: "terminal",
    viewport: VIEWPORT,
    props,
  });
  expect((await ui.find({ type: "Image" }))?.props).toMatchObject({ columns: 80, rows: 23 });
  await ui.redraw(props);
  expect(w.reads).toEqual(["/tmp/chart.png"]);
  await ui.unmount();
});

test("a dimension read failure still draws the file and retries on a redraw", async ($, on) => {
  const w = world(on, "not a png");
  const ui = await sentResult($, {
    attachments: [{ path: "/tmp/chart.png", size: 20, isImage: true, media_type: "image/png" }],
  });
  expect((await ui.find({ type: "Image" }))?.props).toMatchObject({ columns: 80, rows: 25 });
  await ui.redraw();
  expect(w.reads).toEqual(["/tmp/chart.png", "/tmp/chart.png"]);
  await ui.unmount();
});

test("attach-only and failed uploads keep the host renderer", async ($, on) => {
  world(on);
  for (const output of [
    { display: "attach", attachments: [{ path: "/tmp/a.png", isImage: true }] },
    { attachments: [{ path: "/tmp/a.png", isImage: true, upload_error: "failed" }] },
  ]) {
    const ui = await sentResult($, output);
    expect(await ui.find({ type: "Text", text: "host ToolResult" })).toBeDefined();
    expect(await ui.findAll({ type: "Image" })).toHaveLength(0);
    await ui.unmount();
  }
});
