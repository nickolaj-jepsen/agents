import { expect, test } from "claude-code/testing";

// src/claude.test.tsx
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAEAAAAAkCAYAAAA5DDySAAAAdklEQVR42u3ZsRGAIAwFUIZxAAtHsLO2ZyVXYyHcAAu5Q8wrfpm78JrkQtqOXFtZ1r2Z2esTAAAAAAAAEBjg7w98qgfQo4FyncMCAAAAAADeAPQYMyMBPrEJAgAAAAAAAJMC2AQBAHARAgAAQFwAP0MAAIQGuAEhKJcojry0RgAAAABJRU5ErkJggg==";
const READ = {
	type: "image",
	file: {
		type: "image/png",
		base64: PNG,
		originalSize: 176
	}
};
const JPEG = {
	type: "image",
	file: {
		type: "image/jpeg",
		base64: "/9j/4A=="
	}
};
const viewport = {
	columns: 120,
	rows: 45
};
function world(on) {
	const reads = [];
	const placed = [];
	on("session.cwd", () => ({ value: "/project" }));
	on("session.surfaces", () => ({ value: ["terminal"] }));
	on("turn.complete", (_, e) => ({ text: e.answer }));
	on("fs.stat", (_, e) => ({ value: {
		kind: "file",
		size: 176,
		mtimeMs: 123,
		isLink: false,
		realPath: e.path
	} }));
	on("fs.read", (_, e) => {
		reads.push(e.path);
		return { value: { base64: e.path.endsWith(".jpg") ? JPEG.file.base64 : PNG } };
	});
	on("process.run", () => ({ value: {
		exitCode: 0,
		stdout: `data:image/png;base64,${PNG}`,
		stderr: "",
		isStdoutTruncated: false,
		isStderrTruncated: false
	} }));
	on("ui.place", (_, e) => {
		placed.push(e.id);
		return { value: {
			isPlaced: true,
			requestId: e.id
		} };
	});
	on("ui.render", ($, e) => {
		const { Text } = $.ui.resolve(e);
		return /* @__PURE__ */ h(Text, null, `host ${e.component}`);
	});
	return {
		reads,
		placed
	};
}
const call = (id, output, isRunning = false) => ({
	tool_use_id: id,
	tool: "Read",
	input: { file_path: `${id}.png` },
	isRunning,
	isErrored: false,
	isInterrupted: false,
	output
});
test("standalone Read grows with the viewport, and desktop keeps the native renderer", async ($, on) => {
	world(on);
	for (const [surface, columns, rows] of [
		[
			"terminal",
			70,
			24
		],
		[
			"terminal",
			240,
			80
		],
		[
			"desktop",
			120,
			45
		]
	]) {
		const ui = await $.ui.mount({
			plugin: "image-preview",
			component: "ToolResult",
			surface,
			viewport: {
				columns,
				rows
			},
			props: { ...call("read", READ) }
		});
		const image = await ui.find({ type: "Image" });
		if (surface === "terminal") expect(image?.props).toMatchObject({
			source: { png: PNG },
			columns: columns === 70 ? 50 : 144
		});
		else {
			expect(image).toBeUndefined();
			expect(await ui.find({
				type: "Text",
				text: "host ToolResult"
			})).toBeDefined();
		}
		await ui.unmount();
	}
});
test("folded Read keeps the native summary, one thumbnail and the remaining image count", async ($, on) => {
	world(on);
	const ui = await $.ui.mount({
		plugin: "image-preview",
		component: "ToolGroup",
		surface: "terminal",
		viewport,
		props: {
			calls: [
				call("one", READ),
				call("two", JPEG),
				call("running", READ, true),
				call("text", {})
			],
			isActive: false,
			isExpanded: false
		}
	});
	expect(await ui.find({
		type: "Text",
		text: "host ToolGroup"
	})).toBeDefined();
	expect(await ui.find({
		type: "Text",
		text: "+1 more"
	})).toBeDefined();
	const images = await ui.findAll({ type: "Image" });
	expect(images).toHaveLength(1);
	expect(images[0]?.props).toMatchObject({
		columns: 21,
		rows: 6,
		alt: "[image] one.png"
	});
	await ui.unmount();
});
test("expanded JPEG uses the same ToolResult path as standalone Read", async ($, on) => {
	world(on);
	const ui = await $.ui.mount({
		plugin: "image-preview",
		component: "ToolResult",
		surface: "terminal",
		viewport,
		props: {
			...call("jpeg", JPEG),
			isExpanded: true
		}
	});
	expect(await ui.findAll({ type: "Image" })).toHaveLength(1);
	expect((await ui.find({ type: "Image" }))?.props).toMatchObject({
		source: { png: PNG },
		alt: "[image] image.jpg"
	});
	await ui.unmount();
});
test("sent previews extend the native result without replacing attachments", async ($, on) => {
	const w = world(on);
	const output = {
		caption: "Two pictures and a CSV",
		attachments: [
			{
				path: "/tmp/chart.png",
				isImage: true
			},
			{
				path: "/tmp/photo.jpg",
				isImage: true
			},
			{
				path: "/tmp/data.csv",
				isImage: false
			}
		]
	};
	const props = {
		...call("send", output),
		tool: "SendUserFile"
	};
	const ui = await $.ui.mount({
		plugin: "image-preview",
		component: "ToolResult",
		surface: "terminal",
		viewport,
		props
	});
	expect(await ui.find({
		type: "Text",
		text: "host ToolResult"
	})).toBeDefined();
	expect(await ui.findAll({ type: "Image" })).toHaveLength(2);
	await ui.redraw(props);
	expect(w.reads).toEqual(["/tmp/chart.png", "/tmp/photo.jpg"]);
	await ui.redraw({
		...props,
		output: {
			...output,
			display: "attach"
		}
	});
	expect(await ui.findAll({ type: "Image" })).toHaveLength(0);
	await ui.unmount();
});
test("one placed preview per completed reply, not one per paragraph", async ($, on) => {
	const w = world(on);
	const complete = {
		reason: "answer",
		durationMs: 0,
		isAborted: false
	};
	await $.turn.complete({
		...complete,
		turnId: "first",
		answer: "[missing extension](text.txt)\n\n![first](first.jpg)\n\n[second](second.png)"
	});
	await $.turn.complete({
		...complete,
		turnId: "second",
		answer: "plain second.png"
	});
	expect(w.placed).toEqual(["reply-first"]);
	expect(w.reads).toEqual(["/project/first.jpg"]);
	const ui = await $.ui.mount({
		plugin: "image-preview",
		component: "Placed",
		surface: "terminal",
		viewport,
		props: {
			plugin: "image-preview",
			id: "reply-first"
		}
	});
	expect((await ui.find({ type: "Image" }))?.props).toMatchObject({ alt: "[image] first.jpg" });
	await ui.unmount();
});
