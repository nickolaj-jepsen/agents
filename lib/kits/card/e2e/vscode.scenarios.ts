import { cardStories } from "../src/stories.ts";
import { vscodeKitScenarios } from "../../catalog/src/e2e/vscode.ts";

const mine = new Set(cardStories.map((s) => s.component));

export default vscodeKitScenarios("kit-card", (component) => mine.has(component));
