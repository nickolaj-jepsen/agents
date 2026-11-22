import { detailStories } from "../src/stories.ts";
import { claudeScenarios } from "../../catalog/src/e2e/claude.ts";

const mine = new Set(detailStories.map((s) => s.component));

export default claudeScenarios("kit-detail", (component) => mine.has(component));
