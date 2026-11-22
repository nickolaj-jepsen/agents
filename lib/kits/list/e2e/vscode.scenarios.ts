import { listStories } from "../src/stories.ts";
import { vscodeKitScenarios } from "../../catalog/src/e2e/vscode.ts";

const mine = new Set(listStories.map((s) => s.component));

export default vscodeKitScenarios("kit-list", (component) => mine.has(component));
