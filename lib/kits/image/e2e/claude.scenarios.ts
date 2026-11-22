import { imageStories } from "../src/stories.ts";
import { claudeScenarios } from "../../catalog/src/e2e/claude.ts";

const mine = new Set(imageStories.map((s) => s.component));

export default claudeScenarios("kit-image", (component) => mine.has(component));
