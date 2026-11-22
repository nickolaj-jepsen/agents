import { buttonStories } from "../src/stories.ts";
import { claudeScenarios } from "../../catalog/src/e2e/claude.ts";

const mine = new Set(buttonStories.map((s) => s.component));

export default claudeScenarios("kit-buttons", (component) => mine.has(component));
