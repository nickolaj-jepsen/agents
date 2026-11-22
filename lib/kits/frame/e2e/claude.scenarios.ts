import { frameStories } from "../src/stories.ts";
import { claudeScenarios } from "../../catalog/src/e2e/claude.ts";

const mine = new Set(frameStories.map((s) => s.component));

export default claudeScenarios("kit-frame", (component) => mine.has(component));
