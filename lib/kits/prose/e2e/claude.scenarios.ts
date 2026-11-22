import { proseStories } from "../src/stories.ts";
import { claudeScenarios } from "../../catalog/src/e2e/claude.ts";

const mine = new Set(proseStories.map((s) => s.component));

export default claudeScenarios("kit-prose", (component) => mine.has(component));
