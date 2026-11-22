import { buttonStories } from "../src/stories.ts";
import { piScenarios } from "../../catalog/src/e2e/pi.ts";

const mine = new Set(buttonStories.map((s) => s.component));

export default piScenarios("kit-buttons", (component) => mine.has(component));
