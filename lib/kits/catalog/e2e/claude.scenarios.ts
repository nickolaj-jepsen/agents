import { claudeScenarios } from "../src/e2e/claude.ts";
import { kitStories } from "../src/registry.ts";

const kit = new Set(kitStories.map((s) => s.component));

/** The legacy kit's stories: every component that is not one of the kit packages'. */
export default claudeScenarios("kit-catalog", (component) => !kit.has(component));
