import { listStories } from "../src/stories.ts";
import { claudeScenarios } from "../../catalog/src/e2e/claude.ts";

const mine = new Set(listStories.map((s) => s.component));

export default claudeScenarios("kit-list", (component) => mine.has(component));
