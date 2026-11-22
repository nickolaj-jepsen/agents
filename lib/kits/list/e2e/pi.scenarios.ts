import { listStories } from "../src/stories.ts";
import { piScenarios } from "../../catalog/src/e2e/pi.ts";

const mine = new Set(listStories.map((s) => s.component));

export default piScenarios("kit-list", (component) => mine.has(component));
