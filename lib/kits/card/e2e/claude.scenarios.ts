import { cardStories } from "../src/stories.ts";
import { claudeScenarios } from "../../catalog/src/e2e/claude.ts";

const mine = new Set(cardStories.map((s) => s.component));

export default claudeScenarios("kit-card", (component) => mine.has(component));
