import { statusBandStories } from "../src/stories.ts";
import { vscodeKitScenarios } from "../../catalog/src/e2e/vscode.ts";

const mine = new Set(statusBandStories.map((s) => s.component));

export default vscodeKitScenarios("kit-band", (component) => mine.has(component));
