import { frameStories } from "../src/stories.ts";
import { piScenarios } from "../../catalog/src/e2e/pi.ts";

const mine = new Set(frameStories.map((s) => s.component));

export default piScenarios("kit-frame", (component) => mine.has(component));
