import { sheetStories } from "../src/stories.ts";
import { vscodeKitScenarios } from "../../catalog/src/e2e/vscode.ts";

const mine = new Set(sheetStories.map((s) => s.component));

export default vscodeKitScenarios("kit-sheet", (component) => mine.has(component));
