import { statusBandStories } from "../src/stories.ts";
import { claudeScenarios } from "../../catalog/src/e2e/claude.ts";

const mine = new Set(statusBandStories.map((s) => s.component));

export default claudeScenarios("kit-band", (component) => mine.has(component));
