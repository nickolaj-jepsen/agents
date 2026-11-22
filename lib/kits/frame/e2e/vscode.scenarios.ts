import { frameStories } from "../src/stories.ts";
import { vscodeKitScenarios } from "../../catalog/src/e2e/vscode.ts";

const mine = new Set(frameStories.map((s) => s.component));

export default vscodeKitScenarios("kit-frame", (component) => mine.has(component));
