import { proseStories } from "../src/stories.ts";
import { vscodeKitScenarios } from "../../catalog/src/e2e/vscode.ts";

const mine = new Set(proseStories.map((s) => s.component));

export default vscodeKitScenarios("kit-prose", (component) => mine.has(component));
