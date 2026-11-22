import { buttonStories } from "../src/stories.ts";
import { vscodeKitScenarios } from "../../catalog/src/e2e/vscode.ts";

const mine = new Set(buttonStories.map((s) => s.component));

export default vscodeKitScenarios("kit-buttons", (component) => mine.has(component));
