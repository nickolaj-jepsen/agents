import { sheetStories } from "../src/stories.ts";
import { claudeScenarios } from "../../catalog/src/e2e/claude.ts";

const mine = new Set(sheetStories.map((s) => s.component));

export default claudeScenarios("kit-sheet", (component) => mine.has(component));
