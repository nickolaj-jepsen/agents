import { fieldsStories } from "../src/stories.ts";
import { vscodeKitScenarios } from "../../catalog/src/e2e/vscode.ts";

const mine = new Set(fieldsStories.map((s) => s.component));

export default vscodeKitScenarios("kit-fields", (component) => mine.has(component));
