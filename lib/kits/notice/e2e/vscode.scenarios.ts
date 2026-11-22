import { noticeLineStories } from "../src/stories.ts";
import { vscodeKitScenarios } from "../../catalog/src/e2e/vscode.ts";

const mine = new Set(noticeLineStories.map((s) => s.component));

export default vscodeKitScenarios("kit-notice", (component) => mine.has(component));
