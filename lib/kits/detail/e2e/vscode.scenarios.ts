import { detailStories } from "../src/stories.ts";
import { vscodeKitScenarios } from "../../catalog/src/e2e/vscode.ts";

const mine = new Set(detailStories.map((s) => s.component));

export default vscodeKitScenarios("kit-detail", (component) => mine.has(component));
