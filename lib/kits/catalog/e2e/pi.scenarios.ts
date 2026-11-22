import { piScenarios } from "../src/e2e/pi.ts";
import { kitStories } from "../src/registry.ts";

const kit = new Set(kitStories.map((s) => s.component));

/** The legacy kit's stories: every component that is not one of the kit packages'. */
export default piScenarios("kit-catalog", (component) => !kit.has(component));
