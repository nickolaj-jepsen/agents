import { proseStories } from "../src/stories.ts";
import { piScenarios } from "../../catalog/src/e2e/pi.ts";

const mine = new Set(proseStories.map((s) => s.component));

export default piScenarios("kit-prose", (component) => mine.has(component));
